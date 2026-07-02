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

    // Sort by confidence score (descending)
    suggestions.sort_by(|a, b| {
        b.confidence_score
            .partial_cmp(&a.confidence_score)
            .unwrap_or(std::cmp::Ordering::Equal)
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

    // TODO: Update the actual repayment/donation/deposit record
    // This will be done in the frontend integration phase
    // For now, just mark the suggestion as approved

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
