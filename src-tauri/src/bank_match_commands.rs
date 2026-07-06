/**
 * Bank Match Commands Module
 * 
 * Tauri commands for transaction matching and approval.
 */

use crate::bank_integration::{calculate_match_score, ConfidenceLevel, MatchStatus};
use crate::bank_storage::{load_bank_data, save_bank_data, MatchSuggestion};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct GetMatchSuggestionsRequest {
    pub status_filter: Option<String>,
    pub confidence_filter: Option<String>,
    pub match_type_filter: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveMatchRequest {
    pub suggestion_id: String,
}

#[derive(Debug, Deserialize)]
pub struct RejectMatchRequest {
    pub suggestion_id: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateManualMatchRequest {
    pub transaction_id: String,
    pub match_type: String,
    pub target_id: String,
}

// ============================================================================
// Command: Get Match Suggestions
// ============================================================================

#[tauri::command]
pub async fn get_match_suggestions(
    app: AppHandle,
    request: GetMatchSuggestionsRequest,
) -> Result<Vec<MatchSuggestion>, String> {
    let bank_data = load_bank_data(&app)?;

    let mut suggestions = bank_data.match_suggestions.clone();

    // Apply filters
    if let Some(ref status) = request.status_filter {
        suggestions.retain(|s| &s.status == status);
    }

    if let Some(ref confidence) = request.confidence_filter {
        suggestions.retain(|s| &s.confidence_level == confidence);
    }

    if let Some(ref match_type) = request.match_type_filter {
        suggestions.retain(|s| &s.match_type == match_type);
    }

    // Sort by priority:
    // 1. Status: pending first, then skipped, then approved/rejected
    // 2. Confidence score (descending)
    // 3. Created date (most recent first)
    suggestions.sort_by(|a, b| {
        // Priority by status
        let status_priority = |status: &str| match status {
            "pending" => 0,
            "skipped" => 1,
            "approved" => 2,
            "rejected" => 3,
            _ => 4,
        };
        
        let status_cmp = status_priority(&a.status).cmp(&status_priority(&b.status));
        if status_cmp != std::cmp::Ordering::Equal {
            return status_cmp;
        }
        
        // Then by confidence score (higher first)
        let conf_cmp = b.confidence_score
            .partial_cmp(&a.confidence_score)
            .unwrap_or(std::cmp::Ordering::Equal);
        if conf_cmp != std::cmp::Ordering::Equal {
            return conf_cmp;
        }
        
        // Finally by date (most recent first)
        b.created_at.cmp(&a.created_at)
    });

    Ok(suggestions)
}

// ============================================================================
// Command: Approve Match
// ============================================================================

#[tauri::command]
pub async fn approve_match(
    app: AppHandle,
    request: ApproveMatchRequest,
) -> Result<bool, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Find suggestion
    let suggestion = bank_data
        .match_suggestions
        .iter_mut()
        .find(|s| s.id == request.suggestion_id)
        .ok_or("Match suggestion not found")?;

    // Update suggestion status
    suggestion.status = "approved".to_string();
    suggestion.reviewed_at = Some(chrono::Utc::now().to_rfc3339());

    // Note: The actual repayment/donation/deposit record is updated in the frontend
    // after this command succeeds, using localStorage/database.ts methods

    save_bank_data(&app, &bank_data)?;

    Ok(true)
}

// ============================================================================
// Command: Reject Match
// ============================================================================

#[tauri::command]
pub async fn reject_match(
    app: AppHandle,
    request: RejectMatchRequest,
) -> Result<bool, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Find suggestion
    let suggestion = bank_data
        .match_suggestions
        .iter_mut()
        .find(|s| s.id == request.suggestion_id)
        .ok_or("Match suggestion not found")?;

    // Update suggestion status
    suggestion.status = "rejected".to_string();
    suggestion.reviewed_at = Some(chrono::Utc::now().to_rfc3339());

    save_bank_data(&app, &bank_data)?;

    Ok(true)
}

// ============================================================================
// Command: Skip Match
// ============================================================================

#[tauri::command]
pub async fn skip_match(
    app: AppHandle,
    suggestion_id: String,
) -> Result<bool, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Find suggestion
    let suggestion = bank_data
        .match_suggestions
        .iter_mut()
        .find(|s| s.id == suggestion_id)
        .ok_or("Match suggestion not found")?;

    // Update suggestion status
    suggestion.status = "skipped".to_string();
    suggestion.reviewed_at = Some(chrono::Utc::now().to_rfc3339());

    save_bank_data(&app, &bank_data)?;

    Ok(true)
}

// ============================================================================
// Command: Create Manual Match
// ============================================================================

#[tauri::command]
pub async fn create_manual_match(
    app: AppHandle,
    request: CreateManualMatchRequest,
) -> Result<MatchSuggestion, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Find transaction
    let transaction = bank_data
        .bank_transactions
        .iter()
        .find(|t| t.id == request.transaction_id)
        .ok_or("Transaction not found")?
        .clone();

    // Create match suggestion with manual score
    let suggestion = MatchSuggestion {
        id: uuid::Uuid::new_v4().to_string(),
        transaction_id: transaction.id.clone(),
        match_type: request.match_type.clone(),
        target_id: request.target_id.clone(),
        confidence_score: 100.0, // Manual matches are 100% confidence
        confidence_level: "excellent".to_string(),
        match_reasons: vec!["התאמה ידנית".to_string()],
        status: "pending".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        reviewed_at: None,
    };

    bank_data.match_suggestions.push(suggestion.clone());
    save_bank_data(&app, &bank_data)?;

    Ok(suggestion)
}

// ============================================================================
// Command: Get Unmatched Transactions
// ============================================================================

#[tauri::command]
pub async fn get_unmatched_transactions(
    app: AppHandle,
) -> Result<Vec<crate::bank_storage::BankTransaction>, String> {
    let bank_data = load_bank_data(&app)?;

    // Get all transaction IDs that have suggestions
    let matched_transaction_ids: std::collections::HashSet<String> = bank_data
        .match_suggestions
        .iter()
        .filter(|s| s.status == "approved" || s.status == "pending")
        .map(|s| s.transaction_id.clone())
        .collect();

    // Filter transactions that don't have matches
    let unmatched: Vec<_> = bank_data
        .bank_transactions
        .iter()
        .filter(|t| !matched_transaction_ids.contains(&t.id) && !t.is_duplicate)
        .cloned()
        .collect();

    Ok(unmatched)
}

// ============================================================================
// Command: Get Transaction Details
// ============================================================================

#[tauri::command]
pub async fn get_transaction_details(
    app: AppHandle,
    transaction_id: String,
) -> Result<Option<crate::bank_storage::BankTransaction>, String> {
    let bank_data = load_bank_data(&app)?;

    Ok(bank_data
        .bank_transactions
        .iter()
        .find(|t| t.id == transaction_id)
        .cloned())
}

// ============================================================================
// Command: Create Auto Match Suggestions for New Transaction
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct BorrowerWithLoan {
    pub borrower_id: String,
    pub first_name: String,
    pub last_name: String,
    pub phone: String,
    pub loan_amount: f64,
    pub loan_date: String,
    pub loan_id: String,
}

#[derive(Debug, Deserialize)]
pub struct DonationRecord {
    pub donation_id: String,
    pub amount: f64,
    pub date: String,
    pub donor_first: String,
    pub donor_last: String,
    pub donor_phone: String,
}

#[derive(Debug, Deserialize)]
pub struct DepositRecord {
    pub deposit_id: String,
    pub amount: f64,
    pub date: String,
    pub depositor_first: String,
    pub depositor_last: String,
    pub depositor_phone: String,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseRecord {
    pub expense_id: String,
    pub amount: f64,
    pub date: String,
    pub description: String,
    pub category: String,
}

#[derive(Debug, Deserialize)]
pub struct LoanDisbursementRecord {
    pub loan_id: String,
    pub borrower_id: String,
    pub first_name: String,
    pub last_name: String,
    pub amount: f64,
    pub date: String,
    pub loan_purpose: String,
}

#[tauri::command]
pub async fn create_auto_matches_for_transaction(
    app: AppHandle,
    transaction_id: String,
    borrowers: Vec<BorrowerWithLoan>,
    donations: Vec<DonationRecord>,
    deposits: Vec<DepositRecord>,
    expenses: Vec<ExpenseRecord>,
    loan_disbursements: Vec<LoanDisbursementRecord>,
) -> Result<usize, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Find the transaction
    let transaction = bank_data
        .bank_transactions
        .iter()
        .find(|t| t.id == transaction_id)
        .ok_or("Transaction not found")?
        .clone();

    // Convert to tuples for the function
    let borrowers_tuples: Vec<_> = borrowers
        .iter()
        .map(|b| {
            (
                b.borrower_id.clone(),
                b.first_name.clone(),
                b.last_name.clone(),
                b.phone.clone(),
                b.loan_amount,
                b.loan_date.clone(),
                b.loan_id.clone(),
            )
        })
        .collect();

    let donations_tuples: Vec<_> = donations
        .iter()
        .map(|d| {
            (
                d.donation_id.clone(),
                d.amount,
                d.date.clone(),
                d.donor_first.clone(),
                d.donor_last.clone(),
                d.donor_phone.clone(),
            )
        })
        .collect();

    let deposits_tuples: Vec<_> = deposits
        .iter()
        .map(|d| {
            (
                d.deposit_id.clone(),
                d.amount,
                d.date.clone(),
                d.depositor_first.clone(),
                d.depositor_last.clone(),
                d.depositor_phone.clone(),
            )
        })
        .collect();

    let expenses_tuples: Vec<_> = expenses
        .iter()
        .map(|e| {
            (
                e.expense_id.clone(),
                e.amount,
                e.date.clone(),
                e.description.clone(),
                e.category.clone(),
            )
        })
        .collect();

    let loan_disbursements_tuples: Vec<_> = loan_disbursements
        .iter()
        .map(|l| {
            (
                l.loan_id.clone(),
                l.borrower_id.clone(),
                l.first_name.clone(),
                l.last_name.clone(),
                l.amount,
                l.date.clone(),
                l.loan_purpose.clone(),
            )
        })
        .collect();

    // Create suggestions
    let suggestions = crate::bank_integration::create_auto_match_suggestions(
        &transaction,
        &borrowers_tuples,
        &donations_tuples,
        &deposits_tuples,
        &expenses_tuples,
        &loan_disbursements_tuples,
    );

    let mut created_count = 0;

    for (match_type, target_id, score, reasons, _target_name) in suggestions {
        // Don't create duplicate suggestions
        let exists = bank_data.match_suggestions.iter().any(|s| {
            s.transaction_id == transaction_id
                && s.match_type == match_type
                && s.target_id == target_id
        });

        if !exists {
            let suggestion = MatchSuggestion {
                id: uuid::Uuid::new_v4().to_string(),
                transaction_id: transaction_id.clone(),
                match_type,
                target_id,
                confidence_score: score,
                confidence_level: ConfidenceLevel::from_score(score).as_str().to_string(),
                match_reasons: reasons,
                status: "pending".to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                reviewed_at: None,
            };

            bank_data.match_suggestions.push(suggestion);
            created_count += 1;
        }
    }

    if created_count > 0 {
        save_bank_data(&app, &bank_data)?;
    }

    Ok(created_count)
}

// ============================================================================
// Command: Delete Unmatched Transactions
// ============================================================================

#[tauri::command]
pub async fn delete_unmatched_transactions(
    app: AppHandle,
) -> Result<usize, String> {
    let mut bank_data = load_bank_data(&app)?;

    // Get all transaction IDs that have suggestions (matched or pending)
    let matched_transaction_ids: std::collections::HashSet<String> = bank_data
        .match_suggestions
        .iter()
        .map(|s| s.transaction_id.clone())
        .collect();

    // Count unmatched transactions
    let unmatched_count = bank_data
        .bank_transactions
        .iter()
        .filter(|t| !matched_transaction_ids.contains(&t.id) && !t.is_duplicate)
        .count();

    // Remove unmatched transactions
    bank_data.bank_transactions.retain(|t| {
        matched_transaction_ids.contains(&t.id) || t.is_duplicate
    });

    save_bank_data(&app, &bank_data)?;

    Ok(unmatched_count)
}

// ============================================================================
// Command: Reset All Bank Data
// ============================================================================

#[tauri::command]
pub async fn reset_all_bank_data(
    app: AppHandle,
) -> Result<bool, String> {
    crate::bank_storage::delete_bank_data(&app)?;

    // Also delete master password from settings
    let settings_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("settings.json");

    if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;

        // Remove bank-related settings
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("bank_master_password_salt");
            obj.remove("bank_master_password_hash");
            obj.remove("bank_master_password_hint");
            obj.remove("bank_sync_default_days");
            obj.remove("bank_balance_discrepancy_threshold");
        }

        std::fs::write(
            &settings_path,
            serde_json::to_string_pretty(&settings)
                .map_err(|e| format!("Failed to serialize settings: {}", e))?,
        )
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    }

    Ok(true)
}
