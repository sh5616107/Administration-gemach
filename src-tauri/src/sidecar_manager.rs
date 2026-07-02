/**
 * Sidecar Manager Module
 * 
 * Manages the Node.js sidecar process and IPC communication for bank scraping.
 */

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::time::timeout;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Request to send to sidecar
#[derive(Debug, Serialize)]
struct SidecarRequest {
    id: String,
    command: String,
    params: serde_json::Value,
}

/// Response from sidecar
#[derive(Debug, Deserialize)]
struct SidecarResponse {
    id: Option<String>,
    result: Option<serde_json::Value>,
    error: Option<SidecarError>,
}

#[derive(Debug, Deserialize)]
struct SidecarError {
    message: String,
    code: String,
    stack: Option<String>,
}

/// Persistent IO handles for the sidecar process
struct SidecarIo {
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

/// Sidecar manager for controlling the Node.js process
pub struct SidecarManager {
    process: Option<Arc<Mutex<Child>>>,
    io: Option<Arc<Mutex<SidecarIo>>>,
    app_handle: AppHandle,
}

impl SidecarManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            process: None,
            io: None,
            app_handle,
        }
    }

    /// Start the sidecar process
    pub fn start(&mut self) -> Result<(), String> {
        if self.process.is_some() {
            return Ok(()); // Already running
        }

        let mut child = self.spawn_process()?;

        let stdin = child
            .stdin
            .take()
            .ok_or("Failed to get sidecar stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to get sidecar stdout")?;

        let io = SidecarIo {
            stdin,
            reader: BufReader::new(stdout),
        };

        self.io = Some(Arc::new(Mutex::new(io)));
        self.process = Some(Arc::new(Mutex::new(child)));

        Ok(())
    }

    /// Spawn the appropriate process for the current build profile
    fn spawn_process(&self) -> Result<std::process::Child, String> {
        // In debug/dev mode: run with node directly (faster, no build required)
        #[cfg(debug_assertions)]
        {
            let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
            let script_path = manifest_dir
                .parent()
                .unwrap_or(manifest_dir)
                .join("sidecar")
                .join("src")
                .join("index.js");

            if script_path.exists() {
                // Debug: In dev mode, inherit stderr so we can see sidecar logs
        #[cfg(debug_assertions)]
        let stderr_cfg = Stdio::inherit();
        #[cfg(not(debug_assertions))]
        let stderr_cfg = Stdio::piped();

                let mut command = Command::new("node");
                command
                    .arg(&script_path)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(stderr_cfg);
                Self::hide_console_window(&mut command);

                return command.spawn().map_err(|e| format!(
                    "Failed to start sidecar with node: {}. Make sure Node.js is installed.",
                    e
                ));
            }

            // Fallback to binary if node script not found
            let sidecar_path = self.get_sidecar_path()?;
            let mut command = Command::new(sidecar_path);
            command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            Self::hide_console_window(&mut command);

            return command
                .spawn()
                .map_err(|e| format!("Failed to start sidecar: {}", e));
        }

        // In release/production mode: use compiled binary
        #[cfg(not(debug_assertions))]
        {
            let sidecar_path = self.get_sidecar_path()?;
            let mut command = Command::new(sidecar_path);
            command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            Self::hide_console_window(&mut command);

            command
                .spawn()
                .map_err(|e| format!("Failed to start sidecar: {}", e))
        }
    }

    #[cfg(target_os = "windows")]
    fn hide_console_window(command: &mut Command) {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    fn hide_console_window(_command: &mut Command) {}

    /// Stop the sidecar process
    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(process) = self.process.take() {
            let mut child = process
                .lock()
                .map_err(|e| format!("Failed to lock process: {}", e))?;

            child
                .kill()
                .map_err(|e| format!("Failed to kill sidecar: {}", e))?;
        }

        Ok(())
    }

    /// Send command to sidecar and wait for response
    pub async fn send_command(
        &self,
        command: &str,
        params: serde_json::Value,
        timeout_secs: u64,
    ) -> Result<serde_json::Value, String> {
        let io = self
            .io
            .as_ref()
            .ok_or("Sidecar IO not initialized")?
            .clone();

        // Generate unique request ID
        let request_id = uuid::Uuid::new_v4().to_string();

        let request = SidecarRequest {
            id: request_id.clone(),
            command: command.to_string(),
            params,
        };

        // Use tokio spawn_blocking for blocking IO
        let result = timeout(
            Duration::from_secs(timeout_secs),
            tokio::task::spawn_blocking(move || {
                Self::send_and_receive_persistent(io, request, request_id)
            }),
        )
        .await
        .map_err(|_| format!("Sidecar command timeout after {} seconds", timeout_secs))?
        .map_err(|e| format!("Task join error: {}", e))??;

        Ok(result)
    }

    /// Internal method to send request and receive response using persistent IO
    fn send_and_receive_persistent(
        io: Arc<Mutex<SidecarIo>>,
        request: SidecarRequest,
        request_id: String,
    ) -> Result<serde_json::Value, String> {
        eprintln!("[SIDECAR_MGR] Locking IO...");
        let mut io = io
            .lock()
            .map_err(|e| format!("Failed to lock IO: {}", e))?;
        eprintln!("[SIDECAR_MGR] IO locked, sending: {}", serde_json::to_string(&request).unwrap_or_default());

        // Send request
        let request_json = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        writeln!(io.stdin, "{}", request_json)
            .map_err(|e| format!("Failed to write to sidecar: {}", e))?;

        io.stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        // Read response - skip non-JSON lines (e.g. debug output from puppeteer)
        loop {
            let mut response_line = String::new();
            io.reader
                .read_line(&mut response_line)
                .map_err(|e| format!("Failed to read from sidecar: {}", e))?;

            if response_line.is_empty() {
                return Err("Sidecar closed stdout unexpectedly".to_string());
            }

            let trimmed = response_line.trim();
            if trimmed.starts_with('{') {
                let response: SidecarResponse = serde_json::from_str(trimmed)
                    .map_err(|e| format!("Failed to parse response: {}", e))?;

                if let Some(error) = response.error {
                    let stack = error
                        .stack
                        .filter(|stack| !stack.trim().is_empty())
                        .map(|stack| format!("\n{}", stack))
                        .unwrap_or_default();
                    return Err(format!("[{}] {}{}", error.code, error.message, stack));
                }

                if response.id.as_deref() != Some(&request_id) {
                    return Err("Response ID mismatch".to_string());
                }

                return response
                    .result
                    .ok_or_else(|| "No result in response".to_string());
            }

            eprintln!("[SIDECAR] {}", trimmed);
        }
    }

    /// Get path to sidecar binary
    fn get_sidecar_path(&self) -> Result<std::path::PathBuf, String> {
        #[cfg(target_os = "windows")]
        let binary_name = "bank-scraper-x86_64-pc-windows-msvc.exe";

        #[cfg(target_os = "macos")]
        let binary_name = "bank-scraper-universal-apple-darwin";

        #[cfg(target_os = "linux")]
        let binary_name = "bank-scraper-x86_64-unknown-linux-gnu";

        // In dev mode, look next to the Rust source tree (src-tauri/binaries/)
        // In production, Tauri bundles resources next to the executable
        #[cfg(debug_assertions)]
        {
            // __file__ is src-tauri/src/sidecar_manager.rs → go up two levels
            let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
            let dev_path = manifest_dir.join("binaries").join(binary_name);
            if dev_path.exists() {
                return Ok(dev_path);
            }
            return Err(format!(
                "Sidecar binary not found in dev path: {}\n\
                 Run `cd sidecar && npm install && npm run build` to build it.",
                dev_path.display()
            ));
        }

        #[cfg(not(debug_assertions))]
        {
            let resource_dir = self
                .app_handle
                .path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource dir: {}", e))?;

            let path = resource_dir.join(binary_name);

            if !path.exists() {
                return Err(format!(
                    "Sidecar binary not found at: {}",
                    path.display()
                ));
            }

            Ok(path)
        }
    }

    /// Check if sidecar is running
    pub fn is_running(&self) -> bool {
        self.process.is_some()
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

// Add uuid dependency for request IDs
use uuid;
