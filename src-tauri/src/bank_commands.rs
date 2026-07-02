/**
 * Bank Commands Module
 * 
 * Tauri commands for bank integration functionality.
 * All commands are async and return Result<T, String> for error handling.
 */

use crate::bank_integration::{
    calculate_match_score, detect_duplicates, parse_transaction_description, ConfidenceLevel,
    MatchStatus, MatchType,
};
use crate::bank_storage::{
    load_bank_data, save_bank_data, AccountSyncResult, BankAccount, BankData, BankTransaction,
    EncryptedCredentials, MatchSuggestion, SyncSession,
};
use crate::encryption::EncryptionService;
use crate::sidecar_manager::SidecarManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

// ============================================================================
// State Management
// ============================================================================

/// Password lock state for rate limiting failed attempts
#[derive(Debug, Clone)]
pub struct PasswordLockState {
    pub failed_attempts: u32,
    pub is_locked: bool,
    pub locked_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl Default for PasswordLockState {
    fn default() -> Self {
        Self {
            failed_attempts: 0,
            is_locked: false,
            locked_at: None,
        }
    }
}

/// Application state shared across commands
pub struct AppState {
    pub encryption: Arc<Mutex<EncryptionService>>,
    pub sidecar: Arc<tokio::sync::Mutex<Option<SidecarManager>>>,
    pub password_attempts: Arc<Mutex<PasswordLockState>>,
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct SetMasterPasswordRequest {
    pub password: String,
    pub hint: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SetMasterPasswordResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyMasterPasswordRequest {
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyMasterPasswordResponse {
    pub success: bool,
    pub message: Option<String>,
    pub attempts_remaining: Option<u32>,
    pub locked_until: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveBankAccountRequest {
    pub id: Option<String>,
    pub name: String,
    pub company_id: String,
    pub credentials: BankCredentials,
}

#[derive(Debug, Deserialize)]
pub struct BankCredentials {
    pub username: Option<String>,
    pub password: Option<String>,
    pub id_number: Option<String>,    // maps to 'id' in scraper
    pub user_code: Option<String>,    // maps to 'userCode' in scraper
    pub card_6_digits: Option<String>, // maps to 'card6Digits' in scraper
    pub num: Option<String>,          // for Discount/Mercantile
    pub national_id: Option<String>,  // maps to 'nationalID' for Yahav
    pub email: Option<String>,        // for OneZero
    pub phone_number: Option<String>, // for OneZero
}

#[derive(Debug, Serialize)]
pub struct BankAccountResponse {
    pub id: String,
    pub name: String,
    pub company_id: String,
    pub is_active: bool,
    pub last_sync_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
}

// ============================================================================
// Command: Master Password Management
// ============================================================================

#[tauri::command]
pub async fn set_master_password(
    app: AppHandle,
    request: SetMasterPasswordRequest,
    state: State<'_, AppState>,
) -> Result<SetMasterPasswordResponse, String> {
    // Generate salt
    let salt = EncryptionService::generate_salt();

    // Derive hash from password
    let hash = EncryptionService::derive_key_from_password(&request.password, &salt);

    // Load current settings
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Ensure directory exists
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    let settings_path = app_data_dir.join("settings.json");

    let mut settings = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Save salt and hash (as hex)
    settings["bank_master_password_salt"] = serde_json::json!(hex::encode(salt));
    settings["bank_master_password_hash"] = serde_json::json!(hex::encode(hash));
    settings["bank_master_password_hint"] = serde_json::json!(request.hint);

    // Write settings
    std::fs::write(
        &settings_path,
        serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?,
    )
    .map_err(|e| format!("Failed to write settings: {}", e))?;

    // Unlock encryption service
    let mut encryption = state
        .encryption
        .lock()
        .map_err(|e| format!("Failed to lock encryption: {}", e))?;
    encryption.unlock(&request.password, &salt);

    Ok(SetMasterPasswordResponse {
        success: true,
        message: "סיסמת-על הוגדרה בהצלחה".to_string(),
    })
}

#[tauri::command]
pub async fn verify_master_password(
    app: AppHandle,
    request: VerifyMasterPasswordRequest,
    state: State<'_, AppState>,
) -> Result<VerifyMasterPasswordResponse, String> {
    // Check if locked
    let mut attempts_state = state
        .password_attempts
        .lock()
        .map_err(|e| format!("Failed to lock attempts: {}", e))?;

    if attempts_state.is_locked {
        if let Some(locked_at) = attempts_state.locked_at {
            let now = chrono::Utc::now();
            let elapsed = (now - locked_at).num_minutes();

            if elapsed < 5 {
                return Ok(VerifyMasterPasswordResponse {
                    success: false,
                    message: Some(format!("חשבון נעול. נסה שוב בעוד {} דקות", 5 - elapsed)),
                    attempts_remaining: Some(0),
                    locked_until: Some((locked_at + chrono::Duration::minutes(5)).to_rfc3339()),
                });
            } else {
                // Unlock after 5 minutes
                attempts_state.is_locked = false;
                attempts_state.failed_attempts = 0;
                attempts_state.locked_at = None;
            }
        }
    }

    // Load settings
    let settings_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("settings.json");

    if !settings_path.exists() {
        return Err("סיסמת-על לא הוגדרה".to_string());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    let salt_hex = settings["bank_master_password_salt"]
        .as_str()
        .ok_or("Salt not found")?;
    let hash_hex = settings["bank_master_password_hash"]
        .as_str()
        .ok_or("Hash not found")?;

    let salt = hex::decode(salt_hex).map_err(|e| format!("Invalid salt: {}", e))?;
    let stored_hash = hex::decode(hash_hex).map_err(|e| format!("Invalid hash: {}", e))?;

    // Verify password using constant-time comparison
    let is_valid = EncryptionService::verify_password(&request.password, &stored_hash, &salt);

    if is_valid {
        // Reset attempts
        attempts_state.failed_attempts = 0;
        attempts_state.is_locked = false;
        attempts_state.locked_at = None;

        // Unlock encryption service
        let mut encryption = state
            .encryption
            .lock()
            .map_err(|e| format!("Failed to lock encryption: {}", e))?;
        encryption.unlock(&request.password, &salt);

        Ok(VerifyMasterPasswordResponse {
            success: true,
            message: None,
            attempts_remaining: None,
            locked_until: None,
        })
    } else {
        // Increment failed attempts
        attempts_state.failed_attempts += 1;

        if attempts_state.failed_attempts >= 3 {
            // Lock account
            attempts_state.is_locked = true;
            attempts_state.locked_at = Some(chrono::Utc::now());

            Ok(VerifyMasterPasswordResponse {
                success: false,
                message: Some("סיסמה שגויה. החשבון ננעל ל-5 דקות".to_string()),
                attempts_remaining: Some(0),
                locked_until: attempts_state
                    .locked_at
                    .map(|t| (t + chrono::Duration::minutes(5)).to_rfc3339()),
            })
        } else {
            Ok(VerifyMasterPasswordResponse {
                success: false,
                message: Some("סיסמה שגויה".to_string()),
                attempts_remaining: Some(3 - attempts_state.failed_attempts),
                locked_until: None,
            })
        }
    }
}

#[tauri::command]
pub async fn check_master_password_set(app: AppHandle) -> Result<bool, String> {
    let settings_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("settings.json");

    if !settings_path.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings["bank_master_password_hash"].is_string())
}

#[tauri::command]
pub async fn get_master_password_hint(app: AppHandle) -> Result<Option<String>, String> {
    let settings_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("settings.json");

    if !settings_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings["bank_master_password_hint"]
        .as_str()
        .map(|s| s.to_string()))
}

// ============================================================================
// Command: Bank Account Management
// ============================================================================

#[tauri::command]
pub async fn save_bank_account(
    app: AppHandle,
    request: SaveBankAccountRequest,
    state: State<'_, AppState>,
) -> Result<BankAccountResponse, String> {
    // Check if encryption is unlocked
    let encryption = state
        .encryption
        .lock()
        .map_err(|e| format!("Failed to lock encryption: {}", e))?;

    if !encryption.is_unlocked() {
        return Err("Encryption service not unlocked".to_string());
    }

    // Encrypt credentials. Keep all supported fields so the scraper receives
    // the same shape whether invoked manually or through Rust.
    let encrypt_optional = |value: &Option<String>| -> Result<Option<(String, String)>, String> {
        match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            Some(value) => {
                let (ciphertext, nonce) = encryption.encrypt(value)?;
                Ok(Some((ciphertext, nonce)))
            }
            None => Ok(None),
        }
    };

    let username_encrypted = encrypt_optional(&request.credentials.username)?;
    let password_encrypted = encrypt_optional(&request.credentials.password)?;
    let id_number_encrypted = encrypt_optional(&request.credentials.id_number)?;
    let user_code_encrypted = encrypt_optional(&request.credentials.user_code)?;
    let card_6_digits_encrypted = encrypt_optional(&request.credentials.card_6_digits)?;
    let num_encrypted = encrypt_optional(&request.credentials.num)?;
    let national_id_encrypted = encrypt_optional(&request.credentials.national_id)?;
    let email_encrypted = encrypt_optional(&request.credentials.email)?;
    let phone_number_encrypted = encrypt_optional(&request.credentials.phone_number)?;

    drop(encryption); // Release lock

    // Load bank data
    let mut bank_data = load_bank_data(&app)?;

    // Find or create account
    let account_id = request.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let account = BankAccount {
        id: account_id.clone(),
        name: request.name.clone(),
        company_id: request.company_id.clone(),
        encrypted_credentials: EncryptedCredentials {
            username_ciphertext: username_encrypted
                .as_ref()
                .map(|(c, _)| c.clone())
                .unwrap_or_default(),
            username_nonce: username_encrypted
                .as_ref()
                .map(|(_, n)| n.clone())
                .unwrap_or_default(),
            password_ciphertext: password_encrypted
                .as_ref()
                .map(|(c, _)| c.clone())
                .unwrap_or_default(),
            password_nonce: password_encrypted
                .as_ref()
                .map(|(_, n)| n.clone())
                .unwrap_or_default(),
            id_number_ciphertext: id_number_encrypted.as_ref().map(|(c, _)| c.clone()),
            id_number_nonce: id_number_encrypted.as_ref().map(|(_, n)| n.clone()),
            user_code_ciphertext: user_code_encrypted.as_ref().map(|(c, _)| c.clone()),
            user_code_nonce: user_code_encrypted.as_ref().map(|(_, n)| n.clone()),
            card_6_digits_ciphertext: card_6_digits_encrypted.as_ref().map(|(c, _)| c.clone()),
            card_6_digits_nonce: card_6_digits_encrypted.as_ref().map(|(_, n)| n.clone()),
            num_ciphertext: num_encrypted.as_ref().map(|(c, _)| c.clone()),
            num_nonce: num_encrypted.as_ref().map(|(_, n)| n.clone()),
            national_id_ciphertext: national_id_encrypted.as_ref().map(|(c, _)| c.clone()),
            national_id_nonce: national_id_encrypted.as_ref().map(|(_, n)| n.clone()),
            email_ciphertext: email_encrypted.as_ref().map(|(c, _)| c.clone()),
            email_nonce: email_encrypted.as_ref().map(|(_, n)| n.clone()),
            phone_number_ciphertext: phone_number_encrypted.as_ref().map(|(c, _)| c.clone()),
            phone_number_nonce: phone_number_encrypted.as_ref().map(|(_, n)| n.clone()),
        },
        is_active: true,
        last_sync_at: None,
        last_sync_status: None,
        last_sync_error: None,
    };

    // Update or add account
    if let Some(pos) = bank_data
        .bank_accounts
        .iter()
        .position(|a| a.id == account_id)
    {
        bank_data.bank_accounts[pos] = account.clone();
    } else {
        bank_data.bank_accounts.push(account.clone());
    }

    // Save bank data
    save_bank_data(&app, &bank_data)?;

    Ok(BankAccountResponse {
        id: account.id,
        name: account.name,
        company_id: account.company_id,
        is_active: account.is_active,
        last_sync_at: account.last_sync_at,
        last_sync_status: account.last_sync_status,
        last_sync_error: account.last_sync_error,
    })
}

#[tauri::command]
pub async fn get_bank_accounts(
    app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<Vec<BankAccountResponse>, String> {
    let bank_data = load_bank_data(&app)?;

    let accounts = bank_data
        .bank_accounts
        .iter()
        .map(|account| BankAccountResponse {
            id: account.id.clone(),
            name: account.name.clone(),
            company_id: account.company_id.clone(),
            is_active: account.is_active,
            last_sync_at: account.last_sync_at.clone(),
            last_sync_status: account.last_sync_status.clone(),
            last_sync_error: account.last_sync_error.clone(),
        })
        .collect();

    Ok(accounts)
}

#[tauri::command]
pub async fn delete_bank_account(
    app: AppHandle,
    account_id: String,
) -> Result<bool, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Remove account
    let initial_len = bank_data.bank_accounts.len();
    bank_data.bank_accounts.retain(|a| a.id != account_id);

    if bank_data.bank_accounts.len() < initial_len {
        save_bank_data(&app, &bank_data)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn toggle_bank_account(
    app: AppHandle,
    account_id: String,
    is_active: bool,
) -> Result<bool, String> {
    let mut bank_data = load_bank_data(&app)?;

    if let Some(account) = bank_data.bank_accounts.iter_mut().find(|a| a.id == account_id) {
        account.is_active = is_active;
        save_bank_data(&app, &bank_data)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
