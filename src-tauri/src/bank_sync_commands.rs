/**
 * Bank Sync Commands Module
 * 
 * Tauri commands for bank synchronization operations.
 */

use crate::bank_commands::AppState;
use crate::bank_integration::{detect_duplicates, parse_transaction_description};
use crate::bank_storage::{
    load_bank_data, save_bank_data, AccountSyncResult, BankTransaction, SyncSession,
};
use crate::sidecar_manager::SidecarManager;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct StartBankSyncRequest {
    pub account_ids: Option<Vec<String>>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub show_browser: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SyncProgressEvent {
    pub session_id: String,
    pub account_id: String,
    pub account_name: String,
    pub status: String, // "connecting", "fetching", "processing", "completed", "failed"
    pub progress: f32,  // 0.0 to 1.0
    pub message: String,
    pub transactions_count: Option<usize>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StartBankSyncResponse {
    pub session_id: String,
    pub accounts_count: usize,
}

// ============================================================================
// Command: Start Bank Sync
// ============================================================================

#[tauri::command]
pub async fn start_bank_sync(
    app: AppHandle,
    request: StartBankSyncRequest,
    state: State<'_, AppState>,
) -> Result<StartBankSyncResponse, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    // Load bank data
    let mut bank_data = load_bank_data(&app)?;

    // Get accounts to sync
    let accounts_to_sync: Vec<_> = if let Some(ref account_ids) = request.account_ids {
        bank_data
            .bank_accounts
            .iter()
            .filter(|a| account_ids.contains(&a.id) && a.is_active)
            .cloned()
            .collect()
    } else {
        bank_data
            .bank_accounts
            .iter()
            .filter(|a| a.is_active)
            .cloned()
            .collect()
    };

    if accounts_to_sync.is_empty() {
        return Err("אין חשבונות פעילים לסנכרון".to_string());
    }

    let accounts_count = accounts_to_sync.len();

    // Create sync session
    let sync_session = SyncSession {
        id: session_id.clone(),
        started_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
        status: "in_progress".to_string(),
        accounts_synced: Vec::new(),
        total_transactions: 0,
        new_transactions: 0,
        duplicates_skipped: 0,
        matches_created: 0,
    };

    bank_data.sync_sessions.push(sync_session);
    save_bank_data(&app, &bank_data)?;

    // Start sidecar if not running
    {
        let mut sidecar_option = state.sidecar.lock().await;

        if sidecar_option.is_none() {
            let sidecar = SidecarManager::new(app.clone());
            *sidecar_option = Some(sidecar);
        }

        let sidecar = sidecar_option
            .as_mut()
            .ok_or("Failed to get sidecar")?;

        if !sidecar.is_running() {
            sidecar.start()?;
        }
    } // lock released here

    // Spawn async task for syncing
    let app_clone = app.clone();
    let state_encryption = state.encryption.clone();
    let state_sidecar = state.sidecar.clone();
    let session_id_clone = session_id.clone();
    let start_date = request.start_date.clone();
    let end_date = request.end_date.clone();
    let show_browser = request.show_browser.unwrap_or(false);

    tokio::spawn(async move {
        let _ = sync_accounts_task(
            app_clone,
            state_encryption,
            state_sidecar,
            session_id_clone,
            accounts_to_sync,
            start_date,
            end_date,
            show_browser,
        )
        .await;
    });

    Ok(StartBankSyncResponse {
        session_id,
        accounts_count,
    })
}

// ============================================================================
// Sync Task (runs in background)
// ============================================================================

async fn sync_accounts_task(
    app: AppHandle,
    encryption_service: Arc<std::sync::Mutex<crate::encryption::EncryptionService>>,
    sidecar_manager: Arc<tokio::sync::Mutex<Option<SidecarManager>>>,
    session_id: String,
    accounts: Vec<crate::bank_storage::BankAccount>,
    start_date: String,
    end_date: Option<String>,
    show_browser: bool,
) -> Result<(), String> {
    eprintln!("[RUST_TASK] sync_accounts_task started, show_browser={}", show_browser);

    let encryption_locked = {
        let enc = encryption_service.lock().map_err(|e| format!("lock err: {}", e))?;
        !enc.is_unlocked()
    };
    eprintln!("[RUST_TASK] encryption is_locked={}", encryption_locked);

    let mut account_results = Vec::new();
    let mut total_new_transactions = 0;
    let mut total_duplicates = 0;

    // Process each account
    for account in &accounts {
        // Emit progress: connecting
        let _ = app.emit(
            "sync_progress",
            SyncProgressEvent {
                session_id: session_id.clone(),
                account_id: account.id.clone(),
                account_name: account.name.clone(),
                status: "connecting".to_string(),
                progress: 0.0,
                message: "מתחבר לבנק...".to_string(),
                transactions_count: None,
                error_message: None,
            },
        );

        // Decrypt credentials (scope the lock)
        let (
            username,
            password,
            id_number,
            user_code,
            card_6_digits,
            num,
            national_id,
            email,
            phone_number,
        ) = {
            let encryption = encryption_service
                .lock()
                .map_err(|e| format!("Failed to lock encryption: {}", e))?;

            if !encryption.is_unlocked() {
                return Err("Encryption not unlocked".to_string());
            }

            let decrypt_required_pair =
                |field_name: &str, ciphertext: &str, nonce: &str| -> Result<Option<String>, String> {
                    if ciphertext.is_empty() {
                        return Ok(None);
                    }

                    encryption
                        .decrypt(ciphertext, nonce)
                        .map(Some)
                        .map_err(|e| format!("Failed to decrypt {}: {}", field_name, e))
                };

            let decrypt_optional_pair =
                |field_name: &str,
                 ciphertext: &Option<String>,
                 nonce: &Option<String>|
                 -> Result<Option<String>, String> {
                    match (ciphertext.as_ref(), nonce.as_ref()) {
                        (Some(ciphertext), Some(nonce)) if !ciphertext.is_empty() => encryption
                            .decrypt(ciphertext, nonce)
                            .map(Some)
                            .map_err(|e| format!("Failed to decrypt {}: {}", field_name, e)),
                        _ => Ok(None),
                    }
                };

            let username = decrypt_required_pair(
                "username",
                &account.encrypted_credentials.username_ciphertext,
                &account.encrypted_credentials.username_nonce,
            )?;
            let password = decrypt_required_pair(
                "password",
                &account.encrypted_credentials.password_ciphertext,
                &account.encrypted_credentials.password_nonce,
            )?;
            let id_number = decrypt_optional_pair(
                "id_number",
                &account.encrypted_credentials.id_number_ciphertext,
                &account.encrypted_credentials.id_number_nonce,
            )?;
            let user_code = decrypt_optional_pair(
                "user_code",
                &account.encrypted_credentials.user_code_ciphertext,
                &account.encrypted_credentials.user_code_nonce,
            )?;
            let card_6_digits = decrypt_optional_pair(
                "card_6_digits",
                &account.encrypted_credentials.card_6_digits_ciphertext,
                &account.encrypted_credentials.card_6_digits_nonce,
            )?;
            let num = decrypt_optional_pair(
                "num",
                &account.encrypted_credentials.num_ciphertext,
                &account.encrypted_credentials.num_nonce,
            )?;
            let national_id = decrypt_optional_pair(
                "national_id",
                &account.encrypted_credentials.national_id_ciphertext,
                &account.encrypted_credentials.national_id_nonce,
            )?;
            let email = decrypt_optional_pair(
                "email",
                &account.encrypted_credentials.email_ciphertext,
                &account.encrypted_credentials.email_nonce,
            )?;
            let phone_number = decrypt_optional_pair(
                "phone_number",
                &account.encrypted_credentials.phone_number_ciphertext,
                &account.encrypted_credentials.phone_number_nonce,
            )?;

            (
                username,
                password,
                id_number,
                user_code,
                card_6_digits,
                num,
                national_id,
                email,
                phone_number,
            )
        }; // encryption lock released here

        // Prepare credentials JSON
        let mut credentials = serde_json::json!({});
        let mut set_credential = |key: &str, value: Option<String>| {
            if let Some(value) = value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
                credentials[key] = serde_json::json!(value);
            }
        };

        if account.company_id == "hapoalim" {
            set_credential("userCode", user_code.or(username));
        } else {
            set_credential("username", username);
            set_credential("userCode", user_code);
        }
        set_credential("password", password);
        set_credential("id", id_number);
        set_credential("card6Digits", card_6_digits);
        set_credential("num", num);
        set_credential("nationalID", national_id);
        set_credential("email", email);
        set_credential("phoneNumber", phone_number);

        if account.company_id == "hapoalim" && credentials["userCode"].as_str().is_none() {
            eprintln!("[RUST] Missing required userCode for hapoalim account {}", account.id);
        }

        eprintln!(
            "[RUST] Prepared credentials for {} with keys: {:?}",
            account.company_id,
            credentials
                .as_object()
                .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default()
        );

        // Emit progress: fetching
        let _ = app.emit(
            "sync_progress",
            SyncProgressEvent {
                session_id: session_id.clone(),
                account_id: account.id.clone(),
                account_name: account.name.clone(),
                status: "fetching".to_string(),
                progress: 0.3,
                message: "שולף עסקאות...".to_string(),
                transactions_count: None,
                error_message: None,
            },
        );

        // Call sidecar to scrape
        let scrape_params = serde_json::json!({
            "companyId": account.company_id,
            "credentials": credentials,
            "startDate": start_date,
            "endDate": end_date.as_ref().unwrap_or(&chrono::Utc::now().format("%Y-%m-%d").to_string()),
            "showBrowser": show_browser,
        });

        // If showBrowser is enabled, give much longer timeout for OTP input (5 minutes)
        let timeout_secs = if show_browser { 320u64 } else { 180u64 };
        
        eprintln!("[RUST] show_browser = {}", show_browser);
        eprintln!("[RUST] About to call sidecar send_command");

        let scrape_result = {
            let mut sidecar_guard = sidecar_manager.lock().await;
            let sidecar = sidecar_guard
                .as_mut()
                .ok_or("Sidecar not initialized")?;
            eprintln!("[RUST] sidecar is_running = {}", sidecar.is_running());
            sidecar.send_command("scrape", scrape_params, timeout_secs).await
        };

        eprintln!("[RUST] send_command returned: {:?}", scrape_result.is_ok());

        let scrape_result = scrape_result?;

        eprintln!("[RUST] Got result from sidecar");

        // Emit progress: processing
        let _ = app.emit(
            "sync_progress",
            SyncProgressEvent {
                session_id: session_id.clone(),
                account_id: account.id.clone(),
                account_name: account.name.clone(),
                status: "processing".to_string(),
                progress: 0.6,
                message: "מעבד עסקאות...".to_string(),
                transactions_count: None,
                error_message: None,
            },
        );

        // Check if scraping was successful
        let success = scrape_result["success"].as_bool().unwrap_or(false);

        // DEBUG: Print what we got
        println!("[SYNC] Scrape result success: {}", success);
        println!("[SYNC] Scrape result: {}", serde_json::to_string_pretty(&scrape_result).unwrap_or_else(|_| "parse error".to_string()));

        if success {
            let accounts_data = scrape_result["accounts"].as_array();
            
            println!("[SYNC] Number of accounts in result: {}", accounts_data.as_ref().map(|a| a.len()).unwrap_or(0));

            if let Some(accounts_data) = accounts_data {
                let mut new_count = 0;
                let mut duplicate_count = 0;

                for account_data in accounts_data {
                    let transactions = account_data["transactions"].as_array();
                    
                    println!("[SYNC] Processing account, transactions: {}", transactions.as_ref().map(|t| t.len()).unwrap_or(0));

                    if let Some(transactions) = transactions {
                        // Load current bank data
                        let mut bank_data = load_bank_data(&app)?;

                        for txn in transactions {
                            // Create BankTransaction
                            let transaction = BankTransaction {
                                id: uuid::Uuid::new_v4().to_string(),
                                account_id: account.id.clone(),
                                transaction_type: txn["type"]
                                    .as_str()
                                    .unwrap_or("normal")
                                    .to_string(),
                                date: txn["date"].as_str().unwrap_or("").to_string(),
                                processed_date: txn["processedDate"]
                                    .as_str()
                                    .map(|s: &str| s.to_string()),
                                amount: txn["chargedAmount"].as_f64().unwrap_or(0.0),
                                currency: txn["chargedCurrency"]
                                    .as_str()
                                    .unwrap_or("ILS")
                                    .to_string(),
                                description: txn["description"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string(),
                                memo: txn["memo"].as_str().map(|s: &str| s.to_string()),
                                identifier: txn["identifier"]
                                    .as_str()
                                    .map(|s: &str| s.to_string()),
                                category: txn["category"]
                                    .as_str()
                                    .map(|s: &str| s.to_string()),
                                status: txn["status"].as_str().map(|s: &str| s.to_string()),
                                is_duplicate: false,
                                duplicate_reason: None,
                            };

                            // Check for duplicates
                            if let Some((_dup_id, _reason)) = detect_duplicates(
                                &transaction,
                                &bank_data.bank_transactions,
                            ) {
                                duplicate_count += 1;
                                continue;
                            }

                            // Add transaction
                            bank_data.bank_transactions.push(transaction);
                            new_count += 1;
                        }

                        save_bank_data(&app, &bank_data)?;
                    }
                }

                total_new_transactions += new_count;
                total_duplicates += duplicate_count;

                // Emit progress: completed
                let _ = app.emit(
                    "sync_progress",
                    SyncProgressEvent {
                        session_id: session_id.clone(),
                        account_id: account.id.clone(),
                        account_name: account.name.clone(),
                        status: "completed".to_string(),
                        progress: 1.0,
                        message: format!("הושלם! {} עסקאות חדשות", new_count),
                        transactions_count: Some(new_count),
                        error_message: None,
                    },
                );

                account_results.push(AccountSyncResult {
                    account_id: account.id.clone(),
                    account_name: account.name.clone(),
                    status: "completed".to_string(),
                    transactions_count: new_count,
                    error_message: None,
                });
            }
        } else {
            let error_msg = scrape_result["errorMessage"]
                .as_str()
                .unwrap_or("שגיאה לא ידועה")
                .to_string();

            // Emit progress: failed
            let _ = app.emit(
                "sync_progress",
                SyncProgressEvent {
                    session_id: session_id.clone(),
                    account_id: account.id.clone(),
                    account_name: account.name.clone(),
                    status: "failed".to_string(),
                    progress: 0.0,
                    message: error_msg.clone(),
                    transactions_count: None,
                    error_message: Some(error_msg.clone()),
                },
            );

            account_results.push(AccountSyncResult {
                account_id: account.id.clone(),
                account_name: account.name.clone(),
                status: "failed".to_string(),
                transactions_count: 0,
                error_message: Some(error_msg),
            });
        }

        // Continue to next account
    }

    // Update sync session
    let mut bank_data = load_bank_data(&app)?;
    if let Some(session) = bank_data
        .sync_sessions
        .iter_mut()
        .find(|s| s.id == session_id)
    {
        session.completed_at = Some(chrono::Utc::now().to_rfc3339());
        session.status = "completed".to_string();
        session.accounts_synced = account_results;
        session.new_transactions = total_new_transactions;
        session.duplicates_skipped = total_duplicates;
        session.total_transactions = total_new_transactions + total_duplicates;
    }
    save_bank_data(&app, &bank_data)?;

    Ok(())
}

// ============================================================================
// Command: Get Sync Progress
// ============================================================================

#[tauri::command]
pub async fn get_sync_session(
    app: AppHandle,
    session_id: String,
) -> Result<Option<SyncSession>, String> {
    let bank_data = load_bank_data(&app)?;

    Ok(bank_data
        .sync_sessions
        .iter()
        .find(|s| s.id == session_id)
        .cloned())
}

#[tauri::command]
pub async fn get_recent_sync_sessions(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<SyncSession>, String> {
    let bank_data = load_bank_data(&app)?;

    let mut sessions = bank_data.sync_sessions.clone();
    sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    if let Some(limit) = limit {
        sessions.truncate(limit);
    }

    Ok(sessions)
}
