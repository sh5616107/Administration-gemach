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
    pub extracted_names: Vec<String>, // New: extracted person names
}

/// Extract names from memo field in "המבצע: <names>." format
/// Returns a vector of extracted names
pub fn extract_names_from_memo(memo: &str) -> Option<String> {
    // Look for pattern: "המבצע: <name>."
    if let Ok(regex) = regex::Regex::new(r"המבצע:\s*([^.]+)\.") {
        if let Some(cap) = regex.captures(memo) {
            if let Some(names_match) = cap.get(1) {
                return Some(names_match.as_str().trim().to_string());
            }
        }
    }
    None
}

/// Split multiple names by the Hebrew word "ו" (and)
/// Example: "בן ציון ופעשא רבקה וורמס" → ["בן ציון", "פעשא רבקה וורמס"]
/// Note: Only splits on " ו" when NOT followed by another ו (to avoid splitting "וורמס")
pub fn split_multiple_names(names: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = names.chars().collect();
    let len = chars.len();
    
    let mut i = 0;
    while i < len {
        // Check for pattern: space + ו + space (but not space + ו + ו)
        if i + 2 < len && chars[i] == ' ' && chars[i + 1] == 'ו' {
            // Check if it's followed by another ו (like in "וורמס")
            if i + 2 < len && chars[i + 2] != 'ו' && chars[i + 2] != ' ' {
                // This is a separator "ו", not part of a name
                if !current.trim().is_empty() {
                    result.push(current.trim().to_string());
                }
                current = String::new();
                i += 2; // Skip the " ו"
                continue;
            }
        }
        
        current.push(chars[i]);
        i += 1;
    }
    
    // Add the last part
    if !current.trim().is_empty() {
        result.push(current.trim().to_string());
    }
    
    // If we didn't find any splits, return the original
    if result.is_empty() {
        vec![names.trim().to_string()]
    } else {
        result
    }
}

/// Check if a name matches with prefix matching (minimum 3 characters)
/// This handles cases where the bank truncates last names
/// Example: "וורמס" matches "וורמסר"
pub fn match_name_prefix(extracted_name: &str, target_name: &str, min_chars: usize) -> bool {
    let extracted_lower = extracted_name.to_lowercase();
    let target_lower = target_name.to_lowercase();
    
    // Try exact match first
    if extracted_lower == target_lower {
        return true;
    }
    
    // Split into words (first name, last name, etc.)
    let extracted_words: Vec<&str> = extracted_lower.split_whitespace().collect();
    let target_words: Vec<&str> = target_lower.split_whitespace().collect();
    
    // Check if any extracted word is a prefix of any target word (or vice versa)
    for ext_word in &extracted_words {
        for tgt_word in &target_words {
            if ext_word.len() >= min_chars && tgt_word.starts_with(ext_word) {
                return true;
            }
            if tgt_word.len() >= min_chars && ext_word.starts_with(tgt_word) {
                return true;
            }
        }
    }
    
    false
}

/// Check if any of the extracted names matches the target name
/// Returns true if at least one name matches (prefix match with min 3 chars)
pub fn match_any_extracted_name(extracted_names: &[String], target_name: &str) -> bool {
    for extracted in extracted_names {
        if match_name_prefix(extracted, target_name, 3) {
            return true;
        }
    }
    false
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

/// Parse transaction description AND memo to extract useful information
pub fn parse_transaction_description(description: &str) -> ParsedTransaction {
    parse_transaction_with_memo(description, None)
}

/// Parse transaction description AND memo to extract useful information
/// This is the full implementation that handles memo field
pub fn parse_transaction_with_memo(description: &str, memo: Option<&str>) -> ParsedTransaction {
    let mut phone_numbers = Vec::new();
    let mut amounts = Vec::new();
    let mut keywords = Vec::new();
    let mut extracted_names = Vec::new();

    // First, try to extract names from memo if present
    if let Some(memo_text) = memo {
        if let Some(names_from_memo) = extract_names_from_memo(memo_text) {
            // Split multiple names by "ו"
            let split_names = split_multiple_names(&names_from_memo);
            extracted_names.extend(split_names);
        }
    }

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

    // Extract names from description (only if not already extracted from memo)
    if extracted_names.is_empty() {
        // Extract names: Look for patterns that indicate a name
        // Patterns:
        // 1. "מ-<name>" or "מאת <name>" (from <name>)
        // 2. "<name> העביר" or "<name> שילם" (<name> transferred/paid)
        // 3. "העברה מ<name>" (transfer from <name>)
        // 4. Hebrew name patterns (2-4 Hebrew words, each 2+ letters)
        
        let name_patterns = [
            (r"מ[־\-\s]([א-ת\s]{2,30}?)(?:\s|$|\.|\,|\:)", 1),
            (r"מאת\s+([א-ת\s]{2,30}?)(?:\s|$|\.|\,|\:)", 1),
            (r"([א-ת\s]{2,30}?)\s+(?:העביר|שילם|שילמה|העבירה)", 1),
            (r"העברה\s+מ[־\-\s]?([א-ת\s]{2,30}?)(?:\s|$|\.|\,|\:)", 1),
            (r"העברה\s+(?:של|מאת)\s+([א-ת\s]{2,30}?)(?:\s|$|\.|\,|\:)", 1),
        ];

        for (pattern, group_idx) in name_patterns.iter() {
            if let Ok(regex) = regex::Regex::new(pattern) {
                if let Some(cap) = regex.captures(description) {
                    if let Some(name_match) = cap.get(*group_idx) {
                        let name = name_match.as_str().trim();
                        // Filter out common non-name words
                        let excluded_words = ["העברה", "תשלום", "פרעון", "החזר", "הלוואה", "תרומה"];
                        let is_excluded = excluded_words.iter().any(|w| name.contains(w));
                        
                        if !is_excluded && name.len() >= 2 && name.len() <= 40 {
                            // Clean up the name
                            let cleaned_name = name
                                .split_whitespace()
                                .filter(|word| word.len() >= 2)
                                .collect::<Vec<_>>()
                                .join(" ");
                            
                            if !cleaned_name.is_empty() && !extracted_names.contains(&cleaned_name) {
                                extracted_names.push(cleaned_name);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Fallback: If no names extracted yet and description looks like a name (Hebrew letters only, reasonable length)
    // Use the entire description as a name
    if extracted_names.is_empty() && !description.is_empty() {
        // Check if description is mostly Hebrew letters (allow spaces)
        let hebrew_chars: usize = description.chars().filter(|c| ('\u{0590}'..='\u{05FF}').contains(c)).count();
        let total_chars: usize = description.chars().filter(|c| !c.is_whitespace()).count();
        
        // If at least 50% Hebrew and reasonable length (2-40 chars)
        let cleaned_desc = description.trim();
        if total_chars > 0 && 
           hebrew_chars as f64 / total_chars as f64 >= 0.5 && 
           cleaned_desc.len() >= 2 && 
           cleaned_desc.len() <= 40 {
            // Exclude common keywords
            let excluded_keywords = ["העברה", "תשלום", "פרעון", "החזר", "הלוואה", "תרומה", "הפקדה"];
            let is_excluded = excluded_keywords.iter().any(|kw| cleaned_desc.contains(kw));
            
            if !is_excluded {
                extracted_names.push(cleaned_desc.to_string());
            }
        }
    }

    ParsedTransaction {
        phone_numbers,
        amounts,
        keywords,
        extracted_names,
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
/// - Amount match: 35 points
/// - Date proximity: 25 points
/// - Name match (from memo or description): 30 points
/// - Phone match: 20 points
/// - Direction: 5 points
pub fn calculate_match_score(
    transaction: &BankTransaction,
    target_amount: f64,
    target_date: &str,
    target_phone: Option<&str>,
    target_name: Option<&str>, // target person name (first + last)
    expected_direction: &str, // "in" or "out"
) -> (f64, Vec<String>) {
    let mut score = 0.0;
    let mut reasons = Vec::new();

    // Amount match (35 points max)
    let amount_diff = (transaction.amount.abs() - target_amount.abs()).abs();
    
    // Special logic for repayments: allow partial payments
    // If transaction amount is LESS than target amount, it could be a partial payment
    let is_partial_payment = transaction.amount.abs() < target_amount.abs() && transaction.amount.abs() > 0.0;
    
    let amount_score = if amount_diff < 0.01 {
        // Exact match
        35.0
    } else if amount_diff < 1.0 {
        // Almost exact (within 1 currency unit)
        30.0
    } else if amount_diff < 10.0 {
        // Very close (within 10)
        20.0
    } else if amount_diff < 100.0 {
        // Close (within 100)
        8.0
    } else if is_partial_payment {
        // Partial payment: transaction is less than loan remaining
        // Give some points based on how reasonable the partial payment is
        let percentage = (transaction.amount.abs() / target_amount.abs()) * 100.0;
        if percentage >= 10.0 && percentage <= 100.0 {
            // Partial payment between 10% and 100% of remaining debt
            15.0  // Give decent score for partial payment
        } else if percentage < 10.0 && percentage >= 5.0 {
            // Very small partial payment (5-10%)
            8.0
        } else {
            0.0
        }
    } else {
        // Transaction amount is greater than target, or difference is too large
        0.0
    };
    score += amount_score;

    if amount_diff < 1.0 {
        reasons.push("סכום מדויק".to_string());
    } else if amount_diff < 10.0 {
        reasons.push("סכום קרוב".to_string());
    } else if is_partial_payment {
        let percentage = ((transaction.amount.abs() / target_amount.abs()) * 100.0) as i32;
        reasons.push(format!("פירעון חלקי ({}% מהיתרה)", percentage));
    }

    // Date proximity (25 points max)
    let date_diff_days = date_difference_days(&transaction.date, target_date);
    let date_score = if date_diff_days == 0 {
        25.0
    } else if date_diff_days <= 3 {
        20.0
    } else if date_diff_days <= 7 {
        12.0
    } else if date_diff_days <= 14 {
        4.0
    } else {
        0.0
    };
    score += date_score;

    if date_diff_days == 0 {
        reasons.push("תאריך זהה".to_string());
    } else if date_diff_days <= 3 {
        reasons.push(format!("תאריך בטווח {} ימים", date_diff_days));
    }

    // Name match from memo or description (30 points max)
    if let Some(target_name) = target_name {
        // Parse transaction with memo support
        let parsed = parse_transaction_with_memo(
            &transaction.description, 
            transaction.memo.as_deref()
        );
        
        // Check if any extracted name matches the target (with prefix matching)
        if match_any_extracted_name(&parsed.extracted_names, target_name) {
            score += 30.0;
            
            // Find which name matched for the reason
            for extracted in &parsed.extracted_names {
                if match_name_prefix(extracted, target_name, 3) {
                    reasons.push(format!("שם תואם: {}", extracted));
                    break;
                }
            }
        } else {
            // Fallback to old similarity-based matching if no memo extraction worked
            let target_name_lower = target_name.to_lowercase();
            let target_words: Vec<&str> = target_name_lower.split_whitespace().collect();
            
            for extracted_name in &parsed.extracted_names {
                let extracted_lower = extracted_name.to_lowercase();
                
                // Full name exact match
                if extracted_lower == target_name_lower {
                    score += 25.0;
                    reasons.push(format!("שם מלא תואם: {}", extracted_name));
                    break;
                }
                
                // Check if all target words appear in extracted name
                let extracted_words: Vec<&str> = extracted_lower.split_whitespace().collect();
                let all_words_match = target_words.iter().all(|word| 
                    extracted_words.iter().any(|ew| ew.contains(word) || word.contains(ew))
                );
                
                if all_words_match && target_words.len() >= 2 {
                    score += 20.0;
                    reasons.push(format!("שם חלקי תואם: {}", extracted_name));
                    break;
                }
                
                // At least one significant word matches (first or last name)
                let significant_match = target_words.iter().any(|word| 
                    word.len() >= 3 && extracted_words.iter().any(|ew| ew == word)
                );
                
                if significant_match {
                    score += 12.0;
                    reasons.push(format!("חלק משם תואם: {}", extracted_name));
                    break;
                }
            }
        }
    }

    // Phone match (20 points max)
    if let Some(target_phone) = target_phone {
        let parsed = parse_transaction_with_memo(
            &transaction.description,
            transaction.memo.as_deref()
        );
        let normalized_target = normalize_phone(target_phone);

        for phone in &parsed.phone_numbers {
            if phone == &normalized_target {
                score += 20.0;
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

/// Create automatic match suggestions for a transaction
/// Returns Vec of (match_type, target_id, score, reasons, target_name)
pub fn create_auto_match_suggestions(
    transaction: &BankTransaction,
    borrowers_with_loans: &[(String, String, String, String, f64, String, String)], // (borrower_id, first_name, last_name, phone, loan_amount, loan_date, loan_id)
    donations: &[(String, f64, String, String, String, String)], // (donation_id, amount, date, donor_first, donor_last, donor_phone)
    deposits: &[(String, f64, String, String, String, String)], // (deposit_id, amount, date, depositor_first, depositor_last, depositor_phone)
    expenses: &[(String, f64, String, String, String)], // (expense_id, amount, date, description, category)
    loan_disbursements: &[(String, String, String, String, f64, String, String)], // (loan_id, borrower_id, first_name, last_name, amount, date, loan_purpose)
) -> Vec<(String, String, f64, Vec<String>, String)> {
    let mut suggestions = Vec::new();
    let min_score = 50.0; // Minimum score to create suggestion

    // Check repayments (money IN to gemach account)
    if transaction.amount > 0.0 {
        for (borrower_id, first_name, last_name, phone, loan_amount, loan_date, _loan_id) in borrowers_with_loans {
            let full_name = format!("{} {}", first_name, last_name);
            
            let (score, reasons) = calculate_match_score(
                transaction,
                *loan_amount,
                loan_date,
                Some(phone),
                Some(&full_name),
                "in",
            );

            if score >= min_score {
                suggestions.push((
                    "repayment".to_string(),
                    borrower_id.clone(),
                    score,
                    reasons,
                    full_name,
                ));
            }
        }
    }

    // Check donations (money IN from donors)
    if transaction.amount > 0.0 {
        for (donation_id, amount, date, first_name, last_name, phone) in donations {
            let full_name = format!("{} {}", first_name, last_name);
            let (score, reasons) = calculate_match_score(
                transaction,
                *amount,
                date,
                Some(phone),
                Some(&full_name),
                "in",
            );

            if score >= min_score {
                suggestions.push((
                    "donation".to_string(),
                    donation_id.clone(),
                    score,
                    reasons,
                    full_name,
                ));
            }
        }
    }

    // Check deposits (money IN from depositors)
    if transaction.amount > 0.0 {
        for (deposit_id, amount, date, first_name, last_name, phone) in deposits {
            let full_name = format!("{} {}", first_name, last_name);
            let (score, reasons) = calculate_match_score(
                transaction,
                *amount,
                date,
                Some(phone),
                Some(&full_name),
                "in",
            );

            if score >= min_score {
                suggestions.push((
                    "deposit".to_string(),
                    deposit_id.clone(),
                    score,
                    reasons,
                    full_name,
                ));
            }
        }
    }

    // Check expenses (money OUT from gemach - credit card/bank expenses)
    if transaction.amount < 0.0 {
        for (expense_id, amount, date, description, category) in expenses {
            let (score, reasons) = calculate_match_score(
                transaction,
                *amount,
                date,
                None, // No phone for expenses
                None, // No name for expenses, match by description
                "out",
            );

            // Add description similarity bonus
            let desc_similarity = similarity(&transaction.description, description);
            let desc_bonus = (desc_similarity * 20.0) as f64;
            
            let total_score = score + desc_bonus;

            if total_score >= min_score {
                let mut final_reasons = reasons.clone();
                if desc_similarity > 0.7 {
                    final_reasons.push(format!("תיאור דומה ({}%)", (desc_similarity * 100.0) as i32));
                }
                
                suggestions.push((
                    "expense".to_string(),
                    expense_id.clone(),
                    total_score,
                    final_reasons,
                    format!("{} - {}", category, description),
                ));
            }
        }
    }

    // Check loan disbursements (money OUT to borrowers - when loan is given)
    if transaction.amount < 0.0 {
        for (loan_id, borrower_id, first_name, last_name, amount, date, loan_purpose) in loan_disbursements {
            let full_name = format!("{} {}", first_name, last_name);
            let (score, reasons) = calculate_match_score(
                transaction,
                *amount,
                date,
                None, // Phone less relevant for loan disbursement
                Some(&full_name),
                "out",
            );

            if score >= min_score {
                let mut final_reasons = reasons.clone();
                if !loan_purpose.is_empty() {
                    final_reasons.push(format!("מטרה: {}", loan_purpose));
                }
                
                suggestions.push((
                    "loan_disbursement".to_string(),
                    loan_id.clone(),
                    score,
                    final_reasons,
                    format!("{} (הלוואה)", full_name),
                ));
            }
        }
    }

    // Sort by score (highest first)
    suggestions.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    suggestions
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

    #[test]
    fn test_extract_names_from_memo() {
        // Test valid format
        let memo = "המבצע: בן ציון ופעשא רבקה וורמס.";
        let result = extract_names_from_memo(memo);
        assert_eq!(result, Some("בן ציון ופעשא רבקה וורמס".to_string()));

        // Test no match
        let memo_no_match = "תשלום רגיל";
        let result_no_match = extract_names_from_memo(memo_no_match);
        assert_eq!(result_no_match, None);

        // Test with extra spaces
        let memo_spaces = "המבצע:   משה כהן   .";
        let result_spaces = extract_names_from_memo(memo_spaces);
        assert_eq!(result_spaces, Some("משה כהן".to_string()));
    }

    #[test]
    fn test_split_multiple_names() {
        // Test single split
        let names = "בן ציון ופעשא רבקה וורמס";
        let result = split_multiple_names(names);
        assert_eq!(result, vec!["בן ציון", "פעשא רבקה וורמס"]);

        // Test multiple splits
        let names_multi = "משה ודוד ושרה";
        let result_multi = split_multiple_names(names_multi);
        assert_eq!(result_multi, vec!["משה", "דוד", "שרה"]);

        // Test no split needed
        let names_single = "יוסף לוי";
        let result_single = split_multiple_names(names_single);
        assert_eq!(result_single, vec!["יוסף לוי"]);
    }

    #[test]
    fn test_match_name_prefix() {
        // Test exact match
        assert!(match_name_prefix("וורמס", "וורמס", 3));

        // Test prefix match (truncated last name)
        assert!(match_name_prefix("וורמס", "וורמסר", 3));
        assert!(match_name_prefix("וורמסר", "וורמס", 3));

        // Test with full names
        assert!(match_name_prefix("בן ציון וורמס", "בן ציון וורמסר", 3));

        // Test no match
        assert!(!match_name_prefix("כהן", "לוי", 3));

        // Test minimum characters requirement
        assert!(!match_name_prefix("בן", "בנימין", 3)); // "בן" is only 2 chars
    }

    #[test]
    fn test_match_any_extracted_name() {
        let extracted_names = vec![
            "בן ציון".to_string(),
            "פעשא רבקה וורמס".to_string(),
        ];

        // Test match on first name
        assert!(match_any_extracted_name(&extracted_names, "בן ציון"));

        // Test match on second name with prefix
        assert!(match_any_extracted_name(&extracted_names, "פעשא רבקה וורמסר"));

        // Test no match
        assert!(!match_any_extracted_name(&extracted_names, "משה כהן"));
    }

    #[test]
    fn test_parse_transaction_with_memo() {
        // Test with memo containing "המבצע:"
        let description = "העברה/הפקדה-טל";
        let memo = Some("המבצע: בן ציון ופעשא רבקה וורמס.");
        let parsed = parse_transaction_with_memo(description, memo);
        
        assert_eq!(parsed.extracted_names.len(), 2);
        assert_eq!(parsed.extracted_names[0], "בן ציון");
        assert_eq!(parsed.extracted_names[1], "פעשא רבקה וורמס");

        // Test without memo
        let parsed_no_memo = parse_transaction_with_memo(description, None);
        // Should not extract names from this description
        assert!(parsed_no_memo.extracted_names.is_empty() || 
                !parsed_no_memo.extracted_names.contains(&"בן ציון".to_string()));
    }

    #[test]
    fn test_partial_payment_matching() {
        use crate::bank_storage::BankTransaction;
        
        // Create a transaction with partial payment (200 out of 1000 remaining)
        let transaction = BankTransaction {
            id: "test1".to_string(),
            account_id: "acc1".to_string(),
            transaction_type: "credit".to_string(),
            date: "2024-01-15".to_string(),
            processed_date: None,
            amount: 200.0,  // Partial payment
            currency: "ILS".to_string(),
            description: "העברה".to_string(),
            memo: Some("המבצע: משה כהן.".to_string()),
            identifier: None,
            category: None,
            status: None,
            is_duplicate: false,
            duplicate_reason: None,
        };

        let (score, reasons) = calculate_match_score(
            &transaction,
            1000.0,  // Loan remaining: 1000
            "2024-01-15",
            None,
            Some("משה כהן"),
            "in",
        );

        // Should get points for:
        // - Partial payment: 15 points (20% of remaining)
        // - Date exact: 25 points
        // - Name match: 30 points (from memo)
        // - Direction: 5 points
        // Total: 75 points (High confidence)
        
        assert!(score >= 70.0, "Score should be at least 70 for partial payment with name, got {}", score);
        assert!(reasons.iter().any(|r| r.contains("פירעון חלקי")), "Should mention partial payment");
    }
}
