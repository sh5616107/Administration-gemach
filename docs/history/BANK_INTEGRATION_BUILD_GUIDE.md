# Bank Integration - Build and Setup Guide

## Overview

The bank integration feature is now fully implemented with:
- ✅ Backend infrastructure (Rust + Sidecar)
- ✅ Frontend pages (React + TypeScript)
- ✅ Navigation and routing
- ✅ Master password protection
- ✅ Encryption (AES-256-GCM)

## Build Instructions

### Step 1: Install Sidecar Dependencies

```bash
cd sidecar
npm install
```

### Step 2: Build Sidecar Binary

```bash
npm run build
```

This will create the platform-specific binary in `src-tauri/binaries/`:
- **Windows**: `bank-scraper-x86_64-pc-windows-msvc.exe`
- **macOS**: `bank-scraper-universal-apple-darwin`
- **Linux**: `bank-scraper-x86_64-unknown-linux-gnu`

⚠️ **Note**: The binary is ~200MB due to bundled Chromium. This is expected.

### Step 3: Verify Rust Compilation

```bash
cd src-tauri
cargo check
```

Should compile successfully with only dead_code warnings (which are safe to ignore).

### Step 4: Build Tauri Application

Development mode:
```bash
npm run tauri dev
```

Production build:
```bash
npm run tauri build
```

## Testing the Integration

### 1. First Launch - Create Master Password

1. Navigate to: **שילוב בנקים** → **חשבונות בנק**
2. You'll be prompted to create a master password
3. Choose a strong password (minimum 8 characters)
4. Optionally add a hint
5. ⚠️ **IMPORTANT**: Store this password securely! If lost, you'll need to re-enter all bank credentials.

### 2. Add Bank Account

1. Click **הוסף חשבון**
2. Enter:
   - Account name (e.g., "חשבון עסקי")
   - Select bank from dropdown
   - Enter credentials (username/password)
   - For some banks: ID number or user code
3. Click **שמור**

Credentials are encrypted with AES-256-GCM before storage.

### 3. Sync Transactions

1. Navigate to: **שילוב בנקים** → **סנכרון**
2. Select date range (default: last 30 days)
3. Click **התחל סנכרון**
4. Monitor real-time progress for each account
5. When complete, automatically navigate to matching page

### 4. Match Transactions

1. Review suggested matches between bank transactions and Gemach records
2. For each suggestion:
   - **Confidence level**: Excellent / High / Medium / Low / Suspect
   - **Match details**: Amount, date, borrower name
3. Actions:
   - ✓ **אשר** - Approve match
   - ✗ **דחה** - Reject with reason
   - ⏭️ **דלג** - Skip for now
4. Use tabs to filter: All / Pending / Approved / Rejected / Skipped

### 5. View History

Navigate to: **שילוב בנקים** → **היסטוריה**
- See all sync sessions
- Expandable details per session
- Sync status, transaction counts, errors

## Architecture

### Backend (Rust)

**Modules**:
- `encryption.rs` - AES-256-GCM encryption with PBKDF2 key derivation
- `bank_storage.rs` - Separate JSON file storage for bank data
- `bank_integration.rs` - Duplicate detection, match scoring (Levenshtein)
- `sidecar_manager.rs` - Sidecar process lifecycle and IPC
- `bank_commands.rs` - Master password, account CRUD
- `bank_sync_commands.rs` - Async sync with progress events
- `bank_match_commands.rs` - Match suggestions, approve/reject/skip

**Storage**:
- `bank_data.json` - Encrypted accounts and transactions
- Uses app data directory (platform-specific)

### Sidecar (Node.js)

**Purpose**: Runs bank scraping in isolated process using `israeli-bank-scrapers`

**Communication**: JSON over stdin/stdout

**Commands**:
- `scrape` - Fetch transactions
- `test_connection` - Verify credentials
- `get_supported_banks` - List available banks
- `ping` - Health check

### Frontend (React)

**Pages**:
- `BankAccountsPage.tsx` - CRUD for bank accounts
- `BankSyncPage.tsx` - Initiate sync, monitor progress
- `BankMatchingPage.tsx` - Review and approve matches
- `BankHistoryPage.tsx` - Sync history

**Service**:
- `bankService.ts` - TypeScript wrapper for all Tauri commands

**Security**:
- Master password dialog before accessing any bank page
- Session-based unlock (re-verify on app restart)

## Supported Banks

- בנק הפועלים (Hapoalim)
- בנק לאומי (Leumi)
- בנק דיסקונט (Discount)
- בנק מזרחי טפחות (Mizrahi)
- ישראכרט (Isracard)
- ויזה כאל (VisaCal)
- מקס (Max)
- לאומי כרטיסים (Leumi Card)
- בנק יהב (Yahav)
- בנק האיגוד (Union)
- אמריקן אקספרס (Amex)

## Security Features

### Encryption
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations + random salt
- **Master Password**: Required for all operations
- **Rate Limiting**: 5 attempts, then 5-minute lockout

### Isolation
- Bank credentials **NEVER** leave the user's machine
- Sidecar runs in isolated process
- No external API calls for credentials

### Storage
- Encrypted at rest
- Separate from main Gemach database
- Platform-specific secure storage locations

## Troubleshooting

### Sidecar Binary Not Found
**Error**: `Sidecar binary not found at: ...`

**Solution**:
```bash
cd sidecar
npm install
npm run build
```

Verify binary exists in `src-tauri/binaries/`

### Rust Compilation Errors
**Error**: Tokio Mutex / Send trait issues

**Solution**: Already fixed in current code. If you see this:
- Verify `Cargo.toml` includes all dependencies
- Check `bank_sync_commands.rs` uses `tokio::sync::Mutex`

### Bank Scraping Fails
**Possible causes**:
1. Wrong credentials → Re-enter in account settings
2. Bank changed their interface → Update `israeli-bank-scrapers` version
3. OTP required → Feature not yet implemented (manual entry needed)

**Debug**:
Check sidecar stderr output (printed to console in dev mode)

### Master Password Forgotten
**Solution**: No recovery possible for security reasons.

**Workaround**:
1. Manually delete `bank_data.json` from app data directory
2. Create new master password
3. Re-enter all bank credentials

## Next Steps (Future Enhancements)

### Planned Features
- [ ] OTP support for 2FA banks
- [ ] Automatic periodic sync (daily/weekly)
- [ ] Balance reconciliation reports
- [ ] Export matched transactions to CSV
- [ ] Bulk approve/reject for high-confidence matches
- [ ] Custom matching rules editor
- [ ] Multi-currency support

### Known Limitations
- OTP/2FA not supported → Manual entry required for those banks
- Large transaction volumes (>10,000) may be slow
- Chromium dependency increases binary size significantly

## File Locations

### Source Files
```
sidecar/
  src/
    index.js          - Main sidecar entry point
    scraper.js        - Bank scraping logic
  package.json        - Dependencies
  build.js            - Binary build script
  README.md           - Sidecar documentation

src-tauri/
  src/
    bank_*.rs         - Backend modules (7 files)
  binaries/           - Compiled sidecar binaries
  Cargo.toml          - Rust dependencies
  tauri.conf.json     - Tauri configuration

src/
  pages/bank/         - Frontend pages (4 files)
  components/bank/    - MasterPasswordDialog
  services/
    bankService.ts    - Frontend service
```

### Runtime Storage
- **Windows**: `%APPDATA%\com.gemach.manager\bank_data.json`
- **macOS**: `~/Library/Application Support/com.gemach.manager/bank_data.json`
- **Linux**: `~/.local/share/com.gemach.manager/bank_data.json`

## Support

For issues or questions:
1. Check Tauri dev console for errors
2. Review sidecar stderr output
3. Verify master password is correct
4. Check `israeli-bank-scrapers` documentation: https://github.com/eshaham/israeli-bank-scrapers

---

**Implementation Status**: ✅ Complete and ready for testing
**Last Updated**: 2026-06-24
