/**
 * Tests for Bank Service utilities
 */

import { describe, it, expect } from 'vitest';
import { getTransactionDisplayName, BankTransaction } from '../services/bankService';

describe('getTransactionDisplayName', () => {
  it('should extract name from memo with "המבצע:" format', () => {
    const transaction: BankTransaction = {
      id: '1',
      account_id: 'acc1',
      transaction_type: 'credit',
      date: '2024-01-01',
      amount: 250,
      currency: 'ILS',
      description: 'העברה/הפקדה-טל',
      memo: 'המבצע: בן ציון ופעשא רבקה וורמס.',
      is_duplicate: false,
    };

    const result = getTransactionDisplayName(transaction);
    expect(result).toBe('בן ציון ופעשא רבקה וורמס');
  });

  it('should use memo as-is if not in "המבצע:" format', () => {
    const transaction: BankTransaction = {
      id: '2',
      account_id: 'acc1',
      transaction_type: 'credit',
      date: '2024-01-01',
      amount: 100,
      currency: 'ILS',
      description: 'העברה רגילה',
      memo: 'תשלום חודשי',
      is_duplicate: false,
    };

    const result = getTransactionDisplayName(transaction);
    expect(result).toBe('תשלום חודשי');
  });

  it('should fallback to description if memo is empty', () => {
    const transaction: BankTransaction = {
      id: '3',
      account_id: 'acc1',
      transaction_type: 'credit',
      date: '2024-01-01',
      amount: 150,
      currency: 'ILS',
      description: 'העברה ישירה',
      memo: '',
      is_duplicate: false,
    };

    const result = getTransactionDisplayName(transaction);
    expect(result).toBe('העברה ישירה');
  });

  it('should fallback to description if memo is undefined', () => {
    const transaction: BankTransaction = {
      id: '4',
      account_id: 'acc1',
      transaction_type: 'credit',
      date: '2024-01-01',
      amount: 200,
      currency: 'ILS',
      description: 'תשלום בנק',
      is_duplicate: false,
    };

    const result = getTransactionDisplayName(transaction);
    expect(result).toBe('תשלום בנק');
  });

  it('should handle memo with "המבצע:" but no period at the end', () => {
    const transaction: BankTransaction = {
      id: '5',
      account_id: 'acc1',
      transaction_type: 'credit',
      date: '2024-01-01',
      amount: 300,
      currency: 'ILS',
      description: 'העברה',
      memo: 'המבצע: משה כהן',
      is_duplicate: false,
    };

    const result = getTransactionDisplayName(transaction);
    // Should use memo as-is since regex doesn't match (no period)
    expect(result).toBe('המבצע: משה כהן');
  });

  it('should trim whitespace from extracted name', () => {
    const transaction: BankTransaction = {
      id: '6',
      account_id: 'acc1',
      transaction_type: 'credit',
      date: '2024-01-01',
      amount: 250,
      currency: 'ILS',
      description: 'העברה',
      memo: 'המבצע:   שרה לוי   .',
      is_duplicate: false,
    };

    const result = getTransactionDisplayName(transaction);
    expect(result).toBe('שרה לוי');
  });
});
