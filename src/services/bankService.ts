/**
 * Bank Service
 * 
 * TypeScript service for communicating with Tauri backend for bank integration.
 */

// Note: We don't import invoke at the top level to avoid issues in non-Tauri environments
// Instead, we'll use dynamic imports in each method

// ============================================================================
// Types
// ============================================================================

export interface BankAccount {
  id: string;
  name: string;
  company_id: string;
  is_active: boolean;
  last_sync_at?: string;
  last_sync_status?: string;
  last_sync_error?: string;
}

export interface BankCredentials {
  username?: string;
  password?: string;
  id_number?: string;      // maps to 'id' in scraper (Discount, Isracard, etc.)
  user_code?: string;      // maps to 'userCode' in scraper (Hapoalim)
  card_6_digits?: string;  // maps to 'card6Digits' in scraper (Isracard, Amex)
  num?: string;            // for Discount, Mercantile
  national_id?: string;    // maps to 'nationalID' in scraper (Yahav)
  email?: string;          // for OneZero
  phone_number?: string;   // for OneZero
}

export interface BankTransaction {
  id: string;
  account_id: string;
  transaction_type: string;
  date: string;
  processed_date?: string;
  amount: number;
  currency: string;
  description: string;
  memo?: string;
  identifier?: string;
  category?: string;
  status?: string;
  is_duplicate: boolean;
  duplicate_reason?: string;
}

export interface MatchSuggestion {
  id: string;
  transaction_id: string;
  match_type: string; // "repayment" | "donation" | "deposit"
  target_id: string;
  confidence_score: number;
  confidence_level: string; // "excellent" | "high" | "medium" | "low" | "suspect"
  match_reasons: string[];
  status: string; // "pending" | "approved" | "rejected" | "skipped"
  created_at: string;
  reviewed_at?: string;
}

export interface SyncSession {
  id: string;
  started_at: string;
  completed_at?: string;
  status: string; // "in_progress" | "completed" | "failed" | "cancelled"
  accounts_synced: AccountSyncResult[];
  total_transactions: number;
  new_transactions: number;
  duplicates_skipped: number;
  matches_created: number;
}

export interface AccountSyncResult {
  account_id: string;
  account_name: string;
  status: string;
  transactions_count: number;
  error_message?: string;
}

export interface SyncProgressEvent {
  session_id: string;
  account_id: string;
  account_name: string;
  status: string;
  progress: number;
  message: string;
  transactions_count?: number;
  error_message?: string;
}

// ============================================================================
// Bank Service Class
// ============================================================================

class BankService {
  // Master Password Management
  // --------------------------------------------------------------------------

  async setMasterPassword(password: string, hint?: string): Promise<{ success: boolean; message: string }> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('set_master_password', {
        request: { password, hint },
      });
    } catch (error) {
      throw new Error(`Failed to set master password: ${error}`);
    }
  }

  async verifyMasterPassword(password: string): Promise<{
    success: boolean;
    message?: string;
    attempts_remaining?: number;
    locked_until?: string;
  }> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('verify_master_password', {
        request: { password },
      });
    } catch (error) {
      throw new Error(`Failed to verify master password: ${error}`);
    }
  }

  async checkMasterPasswordSet(): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('check_master_password_set');
    } catch (error) {
      console.error('Failed to check master password:', error);
      return false;
    }
  }

  // Alias for checkMasterPasswordSet (used by pages)
  async hasMasterPassword(): Promise<boolean> {
    return this.checkMasterPasswordSet();
  }

  async getMasterPasswordHint(): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_master_password_hint');
    } catch (error) {
      console.error('Failed to get password hint:', error);
      return null;
    }
  }

  // Bank Account Management
  // --------------------------------------------------------------------------

  async getBankAccounts(): Promise<BankAccount[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_bank_accounts');
    } catch (error) {
      throw new Error(`Failed to get bank accounts: ${error}`);
    }
  }

  async saveBankAccount(
    name: string,
    companyId: string,
    credentials: BankCredentials,
    id?: string
  ): Promise<BankAccount> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('save_bank_account', {
        request: {
          id,
          name,
          company_id: companyId,
          credentials,
        },
      });
    } catch (error) {
      throw new Error(`Failed to save bank account: ${error}`);
    }
  }

  async deleteBankAccount(accountId: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('delete_bank_account', { accountId });
    } catch (error) {
      throw new Error(`Failed to delete bank account: ${error}`);
    }
  }

  async toggleBankAccount(accountId: string, isActive: boolean): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('toggle_bank_account', { accountId, isActive });
    } catch (error) {
      throw new Error(`Failed to toggle bank account: ${error}`);
    }
  }

  // Bank Sync Operations
  // --------------------------------------------------------------------------

  async startBankSync(
    startDate: string,
    endDate?: string,
    accountIds?: string[],
    useBrowserMode: boolean = false
  ): Promise<{ session_id: string; accounts_count: number }> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('start_bank_sync', {
        request: {
          account_ids: accountIds || null,
          start_date: startDate,
          end_date: endDate || null,
          show_browser: useBrowserMode,
        },
      });
    } catch (error) {
      throw new Error(`Failed to start bank sync: ${error}`);
    }
  }

  async getSyncSession(sessionId: string): Promise<SyncSession | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_sync_session', { sessionId });
    } catch (error) {
      console.error('Failed to get sync session:', error);
      return null;
    }
  }

  async getRecentSyncSessions(limit?: number): Promise<SyncSession[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_recent_sync_sessions', { limit: limit || null });
    } catch (error) {
      console.error('Failed to get recent sync sessions:', error);
      return [];
    }
  }

  /**
   * Listen to sync progress events
   * Returns an unlisten function to stop listening
   */
  async onSyncProgress(callback: (SyncProgressEvent) => void): Promise<() => void> {
    const { listen } = await import('@tauri-apps/api/event');
    return listen<SyncProgressEvent>('sync_progress', (event) => {
      callback(event.payload);
    });
  }

  // Match Suggestions
  // --------------------------------------------------------------------------

  async getMatchSuggestions(filters?: {
    status_filter?: string;
    confidence_filter?: string;
    match_type_filter?: string;
  }): Promise<MatchSuggestion[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_match_suggestions', {
        request: filters || {},
      });
    } catch (error) {
      throw new Error(`Failed to get match suggestions: ${error}`);
    }
  }

  async approveMatch(suggestionId: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('approve_match', {
        request: { suggestion_id: suggestionId },
      });
    } catch (error) {
      throw new Error(`Failed to approve match: ${error}`);
    }
  }

  async rejectMatch(suggestionId: string, reason?: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('reject_match', {
        request: {
          suggestion_id: suggestionId,
          reason: reason || null,
        },
      });
    } catch (error) {
      throw new Error(`Failed to reject match: ${error}`);
    }
  }

  async skipMatch(suggestionId: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('skip_match', { suggestionId });
    } catch (error) {
      throw new Error(`Failed to skip match: ${error}`);
    }
  }

  async createManualMatch(
    transactionId: string,
    matchType: string,
    targetId: string
  ): Promise<MatchSuggestion> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('create_manual_match', {
        request: {
          transaction_id: transactionId,
          match_type: matchType,
          target_id: targetId,
        },
      });
    } catch (error) {
      throw new Error(`Failed to create manual match: ${error}`);
    }
  }

  // Transactions
  // --------------------------------------------------------------------------

  async getUnmatchedTransactions(): Promise<BankTransaction[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_unmatched_transactions');
    } catch (error) {
      console.error('Failed to get unmatched transactions:', error);
      return [];
    }
  }

  async getTransactionDetails(transactionId: string): Promise<BankTransaction | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_transaction_details', { transactionId });
    } catch (error) {
      console.error('Failed to get transaction details:', error);
      return null;
    }
  }

  // Utility
  // --------------------------------------------------------------------------

  async resetAllBankData(): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('reset_all_bank_data');
    } catch (error) {
      throw new Error(`Failed to reset bank data: ${error}`);
    }
  }
}

// Export singleton instance
export const bankService = new BankService();
export default bankService;
