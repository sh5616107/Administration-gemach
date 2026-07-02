/**
 * Bank Data Storage Module
 * 
 * Manages persistent storage of bank-related data in a separate JSON file
 * to prevent localStorage quota issues.
 */

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Bank account configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankAccount {
    pub id: String,
    pub name: String,
    pub company_id: String,
    pub encrypted_credentials: EncryptedCredentials,
    pub is_active: bool,
    pub last_sync_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
}

/// Encrypted credentials for bank account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedCredentials {
    pub username_ciphertext: String,
    pub username_nonce: String,
    pub password_ciphertext: String,
    pub password_nonce: String,
    #[serde(default)]
    pub id_number_ciphertext: Option<String>,
    #[serde(default)]
    pub id_number_nonce: Option<String>,
    #[serde(default)]
    pub user_code_ciphertext: Option<String>,
    #[serde(default)]
    pub user_code_nonce: Option<String>,
    #[serde(default)]
    pub card_6_digits_ciphertext: Option<String>,
    #[serde(default)]
    pub card_6_digits_nonce: Option<String>,
    #[serde(default)]
    pub num_ciphertext: Option<String>,
    #[serde(default)]
    pub num_nonce: Option<String>,
    #[serde(default)]
    pub national_id_ciphertext: Option<String>,
    #[serde(default)]
    pub national_id_nonce: Option<String>,
    #[serde(default)]
    pub email_ciphertext: Option<String>,
    #[serde(default)]
    pub email_nonce: Option<String>,
    #[serde(default)]
    pub phone_number_ciphertext: Option<String>,
    #[serde(default)]
    pub phone_number_nonce: Option<String>,
}

/// Bank transaction from scraping
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankTransaction {
    pub id: String,
    pub account_id: String,
    pub transaction_type: String,
    pub date: String,
    pub processed_date: Option<String>,
    pub amount: f64,
    pub currency: String,
    pub description: String,
    pub memo: Option<String>,
    pub identifier: Option<String>,
    pub category: Option<String>,
    pub status: Option<String>,
    pub is_duplicate: bool,
    pub duplicate_reason: Option<String>,
}

/// Match suggestion between bank transaction and gemach record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchSuggestion {
    pub id: String,
    pub transaction_id: String,
    pub match_type: String, // "repayment", "donation", "deposit"
    pub target_id: String,
    pub confidence_score: f64,
    pub confidence_level: String, // "excellent", "high", "medium", "low", "suspect"
    pub match_reasons: Vec<String>,
    pub status: String, // "pending", "approved", "rejected", "skipped"
    pub created_at: String,
    pub reviewed_at: Option<String>,
}

/// Sync session record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSession {
    pub id: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub status: String, // "in_progress", "completed", "failed", "cancelled"
    pub accounts_synced: Vec<AccountSyncResult>,
    pub total_transactions: usize,
    pub new_transactions: usize,
    pub duplicates_skipped: usize,
    pub matches_created: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountSyncResult {
    pub account_id: String,
    pub account_name: String,
    pub status: String,
    pub transactions_count: usize,
    pub error_message: Option<String>,
}

/// Main bank data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankData {
    pub bank_accounts: Vec<BankAccount>,
    pub bank_transactions: Vec<BankTransaction>,
    pub match_suggestions: Vec<MatchSuggestion>,
    pub sync_sessions: Vec<SyncSession>,
}

impl Default for BankData {
    fn default() -> Self {
        Self {
            bank_accounts: Vec::new(),
            bank_transactions: Vec::new(),
            match_suggestions: Vec::new(),
            sync_sessions: Vec::new(),
        }
    }
}

/// Get path to bank data file
fn get_bank_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Create directory if it doesn't exist
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("bank_data.json"))
}

/// Load bank data from file
pub fn load_bank_data(app: &AppHandle) -> Result<BankData, String> {
    let path = get_bank_data_path(app)?;

    if !path.exists() {
        // Create empty file if it doesn't exist
        let data = BankData::default();
        save_bank_data(app, &data)?;
        return Ok(data);
    }

    let mut file = File::open(&path)
        .map_err(|e| format!("Failed to open bank data file: {}", e))?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| format!("Failed to read bank data file: {}", e))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse bank data JSON: {}", e))
}

/// Save bank data to file
pub fn save_bank_data(app: &AppHandle, data: &BankData) -> Result<(), String> {
    let path = get_bank_data_path(app)?;
    
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize bank data: {}", e))?;

    let mut file = File::create(&path)
        .map_err(|e| format!("Failed to create bank data file: {}", e))?;

    file.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to write bank data: {}", e))?;

    // Set file permissions (user-only read/write)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o600); // Owner read/write only
        fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }

    Ok(())
}

/// Delete all bank data (for reset functionality)
pub fn delete_bank_data(app: &AppHandle) -> Result<(), String> {
    let path = get_bank_data_path(app)?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete bank data file: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bank_data_default() {
        let data = BankData::default();
        assert_eq!(data.bank_accounts.len(), 0);
        assert_eq!(data.bank_transactions.len(), 0);
        assert_eq!(data.match_suggestions.len(), 0);
        assert_eq!(data.sync_sessions.len(), 0);
    }

    #[test]
    fn test_bank_data_serialization() {
        let data = BankData::default();
        let json = serde_json::to_string(&data).unwrap();
        let deserialized: BankData = serde_json::from_str(&json).unwrap();
        
        assert_eq!(deserialized.bank_accounts.len(), data.bank_accounts.len());
    }
}
