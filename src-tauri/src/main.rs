#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Bank integration modules
mod encryption;
mod bank_storage;
mod bank_integration;
mod sidecar_manager;
mod bank_commands;
mod bank_sync_commands;
mod bank_match_commands;
mod gmail_oauth;

use bank_commands::{AppState, PasswordLockState};
use encryption::EncryptionService;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use keyring::Entry;
use serde::Deserialize;
use std::sync::{Arc, Mutex};

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

const GMAIL_CREDENTIAL_SERVICE: &str = "gemach-manager.gmail-smtp";

fn gmail_credential(sender_email: &str) -> Result<Entry, String> {
    Entry::new(GMAIL_CREDENTIAL_SERVICE, sender_email)
        .map_err(|e| format!("לא ניתן לגשת לאחסון המאובטח של Windows: {e}"))
}

#[tauri::command]
fn save_gmail_credentials(sender_email: String, app_password: String) -> Result<(), String> {
    let sender_email = sender_email.trim().to_lowercase();
    let app_password = app_password.replace(' ', "");
    if !sender_email.contains('@') {
        return Err("כתובת Gmail אינה תקינה".into());
    }
    if app_password.len() != 16 {
        return Err("יש להזין סיסמת אפליקציה של Gmail בת 16 תווים".into());
    }

    gmail_credential(&sender_email)?
        .set_password(&app_password)
        .map_err(|e| format!("לא ניתן לשמור את סיסמת האפליקציה: {e}"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailEmailRequest {
    to: String,
    subject: String,
    body: String,
    sender_email: String,
}

#[tauri::command]
async fn send_gmail_email(request: GmailEmailRequest) -> Result<(), String> {
    let sender_email = request.sender_email.trim().to_lowercase();
    let app_password = gmail_credential(&sender_email)?
        .get_password()
        .map_err(|_| "לא הוגדרה סיסמת אפליקציה לחשבון זה. יש להגדיר אותה בהגדרות המייל.".to_string())?;

    let from: Mailbox = sender_email.parse()
        .map_err(|_| "כתובת השולח אינה תקינה")?;
    let to: Mailbox = request.to.trim().parse()
        .map_err(|_| "כתובת הנמען אינה תקינה")?;
    let message = Message::builder()
        .from(from)
        .to(to)
        .subject(request.subject)
        .body(request.body)
        .map_err(|e| format!("לא ניתן ליצור את הודעת המייל: {e}"))?;

    let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay("smtp.gmail.com")
        .map_err(|e| format!("לא ניתן להתחבר לשרת Gmail: {e}"))?
        .credentials(Credentials::new(sender_email, app_password))
        .build();

    transport.send(message).await
        .map_err(|e| format!("Gmail לא קיבל את ההודעה: {e}"))?;
    Ok(())
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            open_url,
            save_gmail_credentials,
            send_gmail_email,
            gmail_oauth::start_gmail_oauth_login,
            gmail_oauth::send_gmail_oauth_email,
            gmail_oauth::disconnect_gmail_oauth_account,
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
