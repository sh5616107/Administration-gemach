#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Bank integration modules
mod encryption;
mod bank_storage;
mod bank_integration;
mod sidecar_manager;
mod bank_commands;
mod bank_sync_commands;
mod bank_match_commands;

use bank_commands::{AppState, PasswordLockState};
use encryption::EncryptionService;
use std::sync::{Arc, Mutex};

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

fn main() {
    // Initialize app state
    let app_state = AppState {
        encryption: Arc::new(Mutex::new(EncryptionService::new())),
        sidecar: Arc::new(tokio::sync::Mutex::new(None)),
        password_attempts: Arc::new(Mutex::new(PasswordLockState::default())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            open_url,
            // Master password commands
            bank_commands::set_master_password,
            bank_commands::verify_master_password,
            bank_commands::check_master_password_set,
            bank_commands::get_master_password_hint,
            // Bank account commands
            bank_commands::save_bank_account,
            bank_commands::get_bank_accounts,
            bank_commands::delete_bank_account,
            bank_commands::toggle_bank_account,
            // Sync commands
            bank_sync_commands::start_bank_sync,
            bank_sync_commands::get_sync_session,
            bank_sync_commands::get_recent_sync_sessions,
            // Match commands
            bank_match_commands::get_match_suggestions,
            bank_match_commands::approve_match,
            bank_match_commands::reject_match,
            bank_match_commands::skip_match,
            bank_match_commands::create_manual_match,
            bank_match_commands::create_auto_matches_for_transaction,
            bank_match_commands::get_unmatched_transactions,
            bank_match_commands::get_transaction_details,
            bank_match_commands::delete_unmatched_transactions,
            bank_match_commands::reset_all_bank_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
