# Bank Integration Pages

This directory contains all frontend pages for the Israeli Bank Integration feature.

## Pages

### BankAccountsPage.tsx
**Route**: `/bank/accounts`  
**Purpose**: Manage bank account credentials

**Features**:
- Add/Edit/Delete bank accounts
- Enable/Disable accounts
- Encrypted credential storage
- Master password protection
- Support for multiple Israeli banks

### BankSyncPage.tsx
**Route**: `/bank/sync`  
**Purpose**: Initiate and monitor bank transaction sync

**Features**:
- Date range selection with shortcuts (7, 14, 30, 60, 90 days)
- Real-time progress monitoring per account
- Error handling and display
- Auto-navigation to matching page on success
- Event-based progress updates

### BankMatchingPage.tsx
**Route**: `/bank/matching`  
**Purpose**: Review and approve transaction matches

**Features**:
- Match suggestions with confidence levels
- Approve/Reject/Skip actions
- Filter tabs (All/Pending/Approved/Rejected/Skipped)
- Keyboard navigation (←/→ arrows)
- Manual search for unmatched transactions
- Color-coded confidence indicators

### BankHistoryPage.tsx
**Route**: `/bank/history`  
**Purpose**: View sync session history

**Features**:
- List of all sync sessions
- Expandable session details
- Status indicators (completed/failed/in_progress)
- Transaction counts and error messages
- Date sorting (newest first)

## Shared Components

### MasterPasswordDialog
**Location**: `src/components/bank/MasterPasswordDialog.tsx`  
**Used by**: All bank pages

**Features**:
- Create master password (first time)
- Verify master password (subsequent uses)
- Password strength meter
- Rate limiting (5 attempts, then 5-minute lockout)
- Optional hint field

## Service

### bankService.ts
**Location**: `src/services/bankService.ts`  
**Purpose**: TypeScript wrapper for Tauri backend commands

**Functions**:
- Master password: `setMasterPassword`, `verifyMasterPassword`, `hasMasterPassword`
- Accounts: `saveBankAccount`, `getBankAccounts`, `deleteBankAccount`, `toggleBankAccount`
- Sync: `startBankSync`, `onSyncProgress`, `getSyncSession`, `getRecentSyncSessions`
- Matching: `getMatchSuggestions`, `approveMatch`, `rejectMatch`, `skipMatch`

## Data Flow

```
User Action (Page)
      ↓
bankService.ts
      ↓
Tauri invoke
      ↓
Rust Backend (src-tauri/src/bank_*.rs)
      ↓
Sidecar Manager
      ↓
Node.js Sidecar (israeli-bank-scrapers)
      ↓
Bank Website
```

## Security

- All pages require master password verification
- Credentials encrypted with AES-256-GCM
- Master password uses PBKDF2 key derivation
- Rate limiting on verification attempts
- Separate storage from main app data

## Navigation

Access via main menu: **שילוב בנקים** (Bank Integration)

Submenu items:
- חשבונות בנק (Bank Accounts) → BankAccountsPage
- סנכרון (Sync) → BankSyncPage  
- אישור התאמות (Matching) → BankMatchingPage
- היסטוריה (History) → BankHistoryPage

## Development

### Running locally
```bash
npm run dev
npm run tauri dev
```

### Building for production
```bash
cd sidecar
npm run build  # Build sidecar binary first

cd ..
npm run tauri build
```

### Testing
1. Navigate to Bank Accounts page
2. Create master password (first time)
3. Add a test bank account
4. Go to Sync page and sync transactions
5. Review matches in Matching page
6. Check history in History page

## Common Issues

### "Master password required"
**Solution**: Navigate to Bank Accounts page first to set up master password

### "Sidecar not started"
**Solution**: Check that sidecar binary is built and in `src-tauri/binaries/`

### "Bank sync failed"
**Causes**:
- Wrong credentials
- Bank changed interface
- Network issues
- OTP required (not yet supported)

### TypeScript errors
**Solution**: Run `npm run typecheck` to find type mismatches

## Related Files

Backend (Rust):
- `src-tauri/src/bank_commands.rs`
- `src-tauri/src/bank_sync_commands.rs`
- `src-tauri/src/bank_match_commands.rs`

Sidecar (Node.js):
- `sidecar/src/index.js`
- `sidecar/src/scraper.js`

Routes:
- `src/App.tsx` (route definitions)
- `src/components/Layout.tsx` (navigation menu)

## Future Enhancements

- [ ] OTP/2FA support dialog
- [ ] Automatic periodic sync
- [ ] Excel export
- [ ] Balance reconciliation reports
- [ ] Custom matching rules
- [ ] Bulk approve/reject
