/**
 * Encryption Module
 * 
 * Provides AES-256-GCM encryption/decryption with PBKDF2 key derivation
 * for securing bank credentials.
 */

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use subtle::ConstantTimeEq;

// Constants for encryption
const SALT_LENGTH: usize = 16;
const NONCE_LENGTH: usize = 12;
const KEY_LENGTH: usize = 32;
const PBKDF2_ITERATIONS: u32 = 100_000;

/// Encryption service for managing encrypted credentials
pub struct EncryptionService {
    master_key: Option<[u8; KEY_LENGTH]>,
}

impl EncryptionService {
    pub fn new() -> Self {
        Self { master_key: None }
    }

    /// Derive encryption key from password using PBKDF2
    pub fn derive_key_from_password(password: &str, salt: &[u8]) -> [u8; KEY_LENGTH] {
        let mut key = [0u8; KEY_LENGTH];
        pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
        key
    }

    /// Generate random salt for password hashing
    pub fn generate_salt() -> [u8; SALT_LENGTH] {
        let mut salt = [0u8; SALT_LENGTH];
        OsRng.fill_bytes(&mut salt);
        salt
    }

    /// Generate random nonce (IV) for encryption
    fn generate_nonce() -> [u8; NONCE_LENGTH] {
        let mut nonce = [0u8; NONCE_LENGTH];
        OsRng.fill_bytes(&mut nonce);
        nonce
    }

    /// Unlock the encryption service with master password
    /// This derives and stores the encryption key in memory
    pub fn unlock(&mut self, password: &str, salt: &[u8]) {
        let key = Self::derive_key_from_password(password, salt);
        self.master_key = Some(key);
    }

    /// Lock the encryption service (clear master key from memory)
    /// Security cleanup to prevent key leakage
    pub fn lock(&mut self) {
        if let Some(ref mut key) = self.master_key {
            // Zero out the key in memory
            key.iter_mut().for_each(|b| *b = 0);
        }
        self.master_key = None;
    }

    /// Check if encryption service is unlocked
    pub fn is_unlocked(&self) -> bool {
        self.master_key.is_some()
    }

    /// Encrypt data using AES-256-GCM
    /// Returns (ciphertext, nonce) as hex strings
    pub fn encrypt(&self, plaintext: &str) -> Result<(String, String), String> {
        let key = self
            .master_key
            .as_ref()
            .ok_or("Encryption service not unlocked")?;

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;

        let nonce_bytes = Self::generate_nonce();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        Ok((hex::encode(ciphertext), hex::encode(nonce_bytes)))
    }

    /// Decrypt data using AES-256-GCM
    /// Takes ciphertext and nonce as hex strings
    pub fn decrypt(&self, ciphertext_hex: &str, nonce_hex: &str) -> Result<String, String> {
        let key = self
            .master_key
            .as_ref()
            .ok_or("Encryption service not unlocked")?;

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;

        let ciphertext = hex::decode(ciphertext_hex)
            .map_err(|e| format!("Invalid ciphertext hex: {}", e))?;
        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|e| format!("Invalid nonce hex: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))?;

        String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
    }

    /// Verify password against stored hash using constant-time comparison
    /// Prevents timing attacks
    pub fn verify_password(
        password: &str,
        stored_hash: &[u8],
        salt: &[u8],
    ) -> bool {
        let derived_key = Self::derive_key_from_password(password, salt);
        derived_key.ct_eq(stored_hash).into()
    }
}

impl Drop for EncryptionService {
    fn drop(&mut self) {
        // Ensure key is wiped from memory when service is dropped
        self.lock();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_derivation() {
        let password = "test_password_123";
        let salt = EncryptionService::generate_salt();
        let key1 = EncryptionService::derive_key_from_password(password, &salt);
        let key2 = EncryptionService::derive_key_from_password(password, &salt);
        
        assert_eq!(key1, key2, "Same password and salt should produce same key");
    }

    #[test]
    fn test_encryption_decryption() {
        let mut service = EncryptionService::new();
        let password = "test_master_password";
        let salt = EncryptionService::generate_salt();
        
        service.unlock(password, &salt);
        
        let plaintext = "sensitive_bank_password";
        let (ciphertext, nonce) = service.encrypt(plaintext).unwrap();
        let decrypted = service.decrypt(&ciphertext, &nonce).unwrap();
        
        assert_eq!(plaintext, decrypted, "Decrypted text should match original");
    }

    #[test]
    fn test_password_verification() {
        let password = "correct_password";
        let salt = EncryptionService::generate_salt();
        let hash = EncryptionService::derive_key_from_password(password, &salt);
        
        assert!(EncryptionService::verify_password(password, &hash, &salt));
        assert!(!EncryptionService::verify_password("wrong_password", &hash, &salt));
    }

    #[test]
    fn test_lock_unlock() {
        let mut service = EncryptionService::new();
        assert!(!service.is_unlocked());
        
        let password = "test_password";
        let salt = EncryptionService::generate_salt();
        service.unlock(password, &salt);
        assert!(service.is_unlocked());
        
        service.lock();
        assert!(!service.is_unlocked());
    }
}
