// Google "Sign in with Google" + Gmail API sending.
//
// This is an alternative to the Gmail App Password flow (see `main.rs`):
// instead of storing a 16-character app password, the user authorizes this
// app once through Google's own consent screen, and we keep only a refresh
// token (never the user's Google password) in the OS credential store.
//
// Flow:
//   1. Open a loopback listener on 127.0.0.1 (OS-assigned port).
//   2. Open the system browser to Google's OAuth consent screen (PKCE, no
//      client secret required to be kept confidential for Desktop clients).
//   3. Google redirects the browser back to our loopback listener with an
//      authorization code.
//   4. Exchange the code for an access token + refresh token.
//   5. Store the refresh token in the OS credential store, keyed by the
//      connected Google account's own email address.
//   6. To send mail: refresh to get a fresh access token, then call the
//      Gmail API's `messages.send` endpoint directly (no SMTP involved).

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine as _;
use keyring::Entry;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

// Client ID for the "Administration Gemach" Desktop app OAuth client, from
// Google Cloud Console → Google Auth Platform → Clients. Not confidential
// for installed/desktop app clients (Google's own guidance).
const CLIENT_ID: &str = "573518016232-2mt08gpcha4nkfgdb561993leg7j5vki.apps.googleusercontent.com";
// TODO: paste the Client Secret shown next to the Client ID in Cloud Console.
const CLIENT_SECRET: &str = "REPLACE_WITH_CLIENT_SECRET";

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_ENDPOINT: &str = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_SEND_SCOPE: &str = "https://www.googleapis.com/auth/gmail.send";
const OAUTH_KEYRING_SERVICE: &str = "gemach-manager.gmail-oauth";

fn oauth_credential(email: &str) -> Result<Entry, String> {
    Entry::new(OAUTH_KEYRING_SERVICE, email)
        .map_err(|e| format!("לא ניתן לגשת לאחסון המאובטח של Windows: {e}"))
}

fn random_url_safe_string(byte_len: usize) -> String {
    let mut bytes = vec![0u8; byte_len];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Returns (code_verifier, code_challenge) for PKCE (RFC 7636, S256 method).
fn pkce_pair() -> (String, String) {
    let verifier = random_url_safe_string(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
    email: String,
}

/// Opens the browser for Google sign-in, waits for the single redirect back
/// to a local loopback listener, exchanges the code for tokens, and stores
/// the refresh token. Returns the connected Google account's email address.
#[tauri::command]
pub async fn start_gmail_oauth_login() -> Result<String, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("לא ניתן לפתוח ערוץ מקומי להתחברות: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("שגיאה בקביעת הפורט המקומי: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let (code_verifier, code_challenge) = pkce_pair();
    let state = random_url_safe_string(16);

    let mut auth_url =
        url::Url::parse(AUTH_ENDPOINT).map_err(|e| format!("שגיאה פנימית: {e}"))?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", GMAIL_SEND_SCOPE)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state);

    open::that(auth_url.as_str()).map_err(|e| format!("לא ניתן לפתוח את הדפדפן: {e}"))?;

    // Accept exactly one connection: the browser's redirect request.
    let (stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("לא התקבלה תגובה מהדפדפן: {e}"))?;
    let (read_half, mut write_half) = stream.into_split();
    let mut reader = BufReader::new(read_half);

    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .await
        .map_err(|e| format!("שגיאה בקריאת התגובה מהדפדפן: {e}"))?;
    // Drain the remaining request headers (we don't need them).
    loop {
        let mut line = String::new();
        let bytes_read = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("שגיאה בקריאת התגובה מהדפדפן: {e}"))?;
        if bytes_read == 0 || line.trim().is_empty() {
            break;
        }
    }

    let path = request_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.splitn(2, '?').nth(1).unwrap_or("");
    let params: HashMap<String, String> = url::form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect();

    let success = !params.contains_key("error");
    let response_body = if success {
        "<html><body style=\"font-family:sans-serif;text-align:center;padding:40px\">\
         <h2>ההתחברות הושלמה בהצלחה</h2>\
         <p>אפשר לסגור את החלון הזה ולחזור לאפליקציה.</p></body></html>"
    } else {
        "<html><body style=\"font-family:sans-serif;text-align:center;padding:40px\">\
         <h2>ההתחברות בוטלה</h2>\
         <p>אפשר לסגור את החלון הזה ולחזור לאפליקציה.</p></body></html>"
    };
    let http_response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        response_body.as_bytes().len(),
        response_body
    );
    let _ = write_half.write_all(http_response.as_bytes()).await;
    let _ = write_half.shutdown().await;

    if !success {
        return Err("ההתחברות בוטלה".to_string());
    }
    let returned_state = params.get("state").cloned().unwrap_or_default();
    if returned_state != state {
        return Err("אימות ההתחברות נכשל (state לא תואם)".to_string());
    }
    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| "לא התקבל קוד אימות מ-Google".to_string())?;

    exchange_code_and_store(&code, &code_verifier, &redirect_uri).await
}

async fn exchange_code_and_store(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let token_res = client
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("code", code),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("שגיאה בתקשורת מול Google: {e}"))?;

    if !token_res.status().is_success() {
        let body = token_res.text().await.unwrap_or_default();
        return Err(format!("Google דחה את ההתחברות: {body}"));
    }
    let tokens: TokenResponse = token_res
        .json()
        .await
        .map_err(|e| format!("תגובה לא צפויה מ-Google: {e}"))?;
    let refresh_token = tokens.refresh_token.ok_or_else(|| {
        "Google לא החזיר אסימון רענון (refresh token). בטל/י את הגישה הקיימת דרך \
         myaccount.google.com/permissions ונסה/י להתחבר שוב."
            .to_string()
    })?;

    let email = fetch_email(&client, &tokens.access_token).await?;

    oauth_credential(&email)?
        .set_password(&refresh_token)
        .map_err(|e| format!("לא ניתן לשמור את פרטי ההתחברות: {e}"))?;

    Ok(email)
}

async fn fetch_email(client: &reqwest::Client, access_token: &str) -> Result<String, String> {
    let res = client
        .get(USERINFO_ENDPOINT)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("שגיאה בקבלת פרטי החשבון: {e}"))?;
    let info: UserInfo = res
        .json()
        .await
        .map_err(|e| format!("תגובה לא צפויה מ-Google: {e}"))?;
    Ok(info.email.to_lowercase())
}

async fn get_access_token(email: &str) -> Result<String, String> {
    let refresh_token = oauth_credential(email)?.get_password().map_err(|_| {
        "חשבון Google זה אינו מחובר. יש להתחבר מחדש בהגדרות המייל.".to_string()
    })?;

    let client = reqwest::Client::new();
    let res = client
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("שגיאה בתקשורת מול Google: {e}"))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "החיבור לחשבון Google פג תוקף, יש להתחבר מחדש בהגדרות המייל: {body}"
        ));
    }
    let tokens: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("תגובה לא צפויה מ-Google: {e}"))?;
    Ok(tokens.access_token)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailOAuthEmailRequest {
    pub to: String,
    pub subject: String,
    pub body: String,
    pub sender_email: String,
}

/// RFC 2047 encoded-word, needed so a Hebrew subject line survives transit.
fn encode_subject(subject: &str) -> String {
    format!("=?UTF-8?B?{}?=", STANDARD.encode(subject.as_bytes()))
}

#[tauri::command]
pub async fn send_gmail_oauth_email(request: GmailOAuthEmailRequest) -> Result<(), String> {
    let sender_email = request.sender_email.trim().to_lowercase();
    let access_token = get_access_token(&sender_email).await?;

    let raw_message = format!(
        "From: {from}\r\nTo: {to}\r\nSubject: {subject}\r\n\
         Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{body}",
        from = sender_email,
        to = request.to.trim(),
        subject = encode_subject(&request.subject),
        body = request.body,
    );
    let encoded_message = URL_SAFE_NO_PAD.encode(raw_message.as_bytes());

    let client = reqwest::Client::new();
    let res = client
        .post(GMAIL_SEND_ENDPOINT)
        .bearer_auth(access_token)
        .json(&serde_json::json!({ "raw": encoded_message }))
        .send()
        .await
        .map_err(|e| format!("שגיאה בשליחת המייל: {e}"))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Gmail לא קיבל את ההודעה: {body}"));
    }
    Ok(())
}

#[tauri::command]
pub fn disconnect_gmail_oauth_account(sender_email: String) -> Result<(), String> {
    let sender_email = sender_email.trim().to_lowercase();
    oauth_credential(&sender_email)?
        .delete_credential()
        .map_err(|e| format!("לא ניתן למחוק את פרטי ההתחברות: {e}"))
}
