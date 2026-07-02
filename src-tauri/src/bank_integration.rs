/**
 * Bank Integration Module
 * 
 * Business logic for matching transactions, detecting duplicates,
 * and calculating confidence scores.
 */

use crate::bank_storage::BankTransaction;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MatchType {
    Repayment,
    Donation,
    Deposit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConfidenceLevel {
    Excellent, // 90-100%
    High,      // 75-89%
    Medium,    // 50-74%
    Low,       // 25-49%
    Suspect,   // 0-24%
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MatchStatus {
    Pending,
    Approved,
    Rejected,
    Skipped,
}

impl MatchType {
    pub fn as_str(&self) -> &str {
        match self {
            MatchType::Repayment => "repayment",
            MatchType::Donation => "donation",
            MatchType::Deposit => "deposit",
        }
    }
}

impl ConfidenceLevel {
    pub fn from_score(score: f64) -> Self {
        if score >= 90.0 {
            ConfidenceLevel::Excellent
        } else if score >= 75.0 {
            ConfidenceLevel::High
        } else if score >= 50.0 {
            ConfidenceLevel::Medium
        } else if score >= 25.0 {
            ConfidenceLevel::Low
        } else {
            ConfidenceLevel::Suspect
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            ConfidenceLevel::Excellent => "excellent",
            ConfidenceLevel::High => "high",
            ConfidenceLevel::Medium => "medium",
            ConfidenceLevel::Low => "low",
            ConfidenceLevel::Suspect => "suspect",
        }
    }
}

impl MatchStatus {
    pub fn as_str(&self) -> &str {
        match self {
            MatchStatus::Pending => "pending",
            MatchStatus::Approved => "approved",
            MatchStatus::Rejected => "rejected",
            MatchStatus::Skipped => "skipped",
        }
    }
}

/// Parsed transaction information
#[derive(Debug, Clone)]
pub struct ParsedTransaction {
    pub phone_numbers: Vec<String>,
    pub amounts: Vec<f64>,
    pub keywords: Vec<String>,
}

/// Detect duplicate transactions
/// Two-phase detection:
/// 1. Check bank_reference_id (identifier field) - 100% confidence
/// 2. Check combination of date, amount, description - 80% confidence
pub fn detect_duplicates(
    transaction: &BankTransaction,
    existing_transactions: &[BankTransaction],
) -> Option<(String, String)> {
    // Phase 1: Check identifier (bank reference ID)
    if let Some(ref identifier) = transaction.identifier {
        for existing in existing_transactions {
            if let Some(ref existing_id) = existing.identifier {
                if identifier == existing_id && transaction.account_id == existing.account_id {
                    return Some((
                        existing.id.clone(),
                        "exact_identifier_match".to_string(),
                    ));
                }
            }
        }
    }

    // Phase 2: Check combination (date + amount + description)
    for existing in existing_transactions {
        if transaction.account_id == existing.account_id
            && transaction.date == existing.date
            && (transaction.amount - existing.amount).abs() < 0.01
            && similarity(&transaction.description, &existing.description) > 0.95
        {
            return Some((existing.id.clone(), "combined_match".to_string()));
        }
    }

    None
}

/// Calculate Levenshtein distance-based similarity (0.0 to 1.0)
pub fn similarity(a: &str, b: &str) -> f64 {
    let a_len = a.chars().count();
    let b_len = b.chars().count();

    if a_len == 0 && b_len == 0 {
        return 1.0;
    }
    if a_len == 0 || b_len == 0 {
        return 0.0;
    }

    let distance = levenshtein_distance(a, b);
    let max_len = a_len.max(b_len);

    1.0 - (distance as f64 / max_len as f64)
}

/// Calculate Levenshtein distance
fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 {
        return b_len;
    }
    if b_len == 0 {
        return a_len;
    }

    let mut matrix = vec![vec![0; b_len + 1]; a_len + 1];

    for i in 0..=a_len {
        matrix[i][0] = i;
    }
    for j in 0..=b_len {
        matrix[0][j] = j;
    }

    for i in 1..=a_len {
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            matrix[i][j] = (matrix[i - 1][j] + 1)
                .min(matrix[i][j - 1] + 1)
                .min(matrix[i - 1][j - 1] + cost);
        }
    }

    matrix[a_len][b_len]
}

/// Parse transaction description to extract useful information
pub fn parse_transaction_description(description: &str) -> ParsedTransaction {
    let mut phone_numbers = Vec::new();
    let mut amounts = Vec::new();
    let mut keywords = Vec::new();

    // Extract Israeli phone numbers (05X-XXXXXXX, 05X-XXX-XXXX, etc.)
    let phone_regex = regex::Regex::new(r"05\d[\d\-\s]{7,9}\d").unwrap();
    for cap in phone_regex.find_iter(description) {
        let phone = normalize_phone(cap.as_str());
        phone_numbers.push(phone);
    }

    // Extract amounts (numbers with optional decimal point)
    let amount_regex = regex::Regex::new(r"\d+(?:\.\d{1,2})?").unwrap();
    for cap in amount_regex.find_iter(description) {
        if let Ok(amount) = cap.as_str().parse::<f64>() {
            amounts.push(amount);
        }
    }

    // Extract keywords (common Hebrew words for loans, donations, etc.)
    let loan_keywords = [
        "הלוואה", "גמ\"ח", "גמח", "החזר", "פרעון", "תשלום", "לווה",
    ];
    let donation_keywords = ["תרומה", "תורם", "הפקדה", "נדבה"];

    for keyword in loan_keywords.iter().chain(donation_keywords.iter()) {
        if description.contains(keyword) {
            keywords.push(keyword.to_string());
        }
    }

    ParsedTransaction {
        phone_numbers,
        amounts,
        keywords,
    }
}

/// Normalize phone number to canonical format (05XXXXXXXX)
pub fn normalize_phone(phone: &str) -> String {
    phone
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<String>()
}

/// Calculate match score between transaction and potential target
/// Algorithm:
/// - Amount match: 40 points
/// - Date proximity: 30 points
/// - Phone match: 25 points
/// - Direction: 5 points
pub fn calculate_match_score(
    transaction: &BankTransaction,
    target_amount: f64,
    target_date: &str,
    target_phone: Option<&str>,
    expected_direction: &str, // "in" or "out"
) -> (f64, Vec<String>) {
    let mut score = 0.0;
    let mut reasons = Vec::new();

    // Amount match (40 points max)
    let amount_diff = (transaction.amount.abs() - target_amount.abs()).abs();
    let amount_score = if amount_diff < 0.01 {
        40.0
    } else if amount_diff < 1.0 {
        35.0
    } else if amount_diff < 10.0 {
        25.0
    } else if amount_diff < 100.0 {
        10.0
    } else {
        0.0
    };
    score += amount_score;

    if amount_diff < 1.0 {
        reasons.push("סכום מדויק".to_string());
    } else if amount_diff < 10.0 {
        reasons.push("סכום קרוב".to_string());
    }

    // Date proximity (30 points max)
    let date_diff_days = date_difference_days(&transaction.date, target_date);
    let date_score = if date_diff_days == 0 {
        30.0
    } else if date_diff_days <= 3 {
        25.0
    } else if date_diff_days <= 7 {
        15.0
    } else if date_diff_days <= 14 {
        5.0
    } else {
        0.0
    };
    score += date_score;

    if date_diff_days == 0 {
        reasons.push("תאריך זהה".to_string());
    } else if date_diff_days <= 3 {
        reasons.push(format!("תאריך בטווח {} ימים", date_diff_days));
    }

    // Phone match (25 points max)
    if let Some(target_phone) = target_phone {
        let parsed = parse_transaction_description(&transaction.description);
        let normalized_target = normalize_phone(target_phone);

        for phone in &parsed.phone_numbers {
            if phone == &normalized_target {
                score += 25.0;
                reasons.push("טלפון תואם".to_string());
                break;
            }
        }
    }

    // Direction match (5 points)
    let transaction_direction = if transaction.amount > 0.0 { "in" } else { "out" };
    if transaction_direction == expected_direction {
        score += 5.0;
    } else {
        reasons.push("⚠️ כיוון לא תואם".to_string());
    }

    (score, reasons)
}

/// Calculate date difference in days
fn date_difference_days(date1: &str, date2: &str) -> i64 {
    // Parse ISO date strings (YYYY-MM-DD)
    let d1 = chrono::NaiveDate::parse_from_str(date1, "%Y-%m-%d").unwrap_or_default();
    let d2 = chrono::NaiveDate::parse_from_str(date2, "%Y-%m-%d").unwrap_or_default();

    (d1 - d2).num_days().abs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_similarity() {
        assert!(similarity("hello", "hello") > 0.99);
        assert!(similarity("hello", "helo") > 0.7);
        assert!(similarity("hello", "world") < 0.3);
    }

    #[test]
    fn test_normalize_phone() {
        assert_eq!(normalize_phone("054-123-4567"), "0541234567");
        assert_eq!(normalize_phone("054 123 4567"), "0541234567");
        assert_eq!(normalize_phone("0541234567"), "0541234567");
    }

    #[test]
    fn test_parse_transaction_description() {
        let parsed = parse_transaction_description("החזר הלוואה 054-123-4567 סכום 1000");
        assert!(parsed.phone_numbers.len() > 0);
        assert!(parsed.keywords.contains(&"הלוואה".to_string()));
    }

    #[test]
    fn test_confidence_level() {
        assert_eq!(ConfidenceLevel::from_score(95.0), ConfidenceLevel::Excellent);
        assert_eq!(ConfidenceLevel::from_score(80.0), ConfidenceLevel::High);
        assert_eq!(ConfidenceLevel::from_score(60.0), ConfidenceLevel::Medium);
        assert_eq!(ConfidenceLevel::from_score(30.0), ConfidenceLevel::Low);
        assert_eq!(ConfidenceLevel::from_score(10.0), ConfidenceLevel::Suspect);
    }
}
