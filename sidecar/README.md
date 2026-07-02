# Bank Scraper Sidecar

This is a Node.js sidecar process that runs alongside the Tauri application to handle bank scraping operations using the `israeli-bank-scrapers` library.

## Architecture

The sidecar communicates with the Tauri backend through stdin/stdout using JSON messages:

```json
// Request (from Tauri to sidecar)
{
  "id": "unique-request-id",
  "command": "scrape",
  "params": {
    "companyId": "hapoalim",
    "credentials": {
      "username": "username",
      "password": "password"
    },
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}

// Response (from sidecar to Tauri)
{
  "id": "unique-request-id",
  "result": { ... },
  "error": null
}
```

## Available Commands

- `scrape` - Scrape bank transactions
- `test_connection` - Test bank credentials without fetching transactions
- `get_supported_banks` - Get list of supported banks
- `ping` - Health check

## Building

To build the sidecar binary:

```bash
cd sidecar
npm install
npm run build
```

This will create platform-specific binaries in `../src-tauri/binaries/`:
- Windows: `bank-scraper-x86_64-pc-windows-msvc.exe`
- macOS: `bank-scraper-universal-apple-darwin`
- Linux: `bank-scraper-x86_64-unknown-linux-gnu`

## Development

To run the sidecar locally for testing:

```bash
npm start
```

Then send JSON commands via stdin:

```bash
echo '{"id":"1","command":"ping","params":{}}' | node src/index.js
```

## Chromium

The sidecar includes a bundled Chromium browser via Puppeteer. This significantly increases the binary size (~200MB) but ensures the scraper works without requiring Chrome/Chromium to be installed on the user's system.

## Security Notes

- The sidecar does NOT store credentials - they are passed from the Tauri backend on each request
- All bank communication happens locally on the user's machine
- No data is sent to external servers
- Credentials are encrypted in the Tauri backend before being passed to the sidecar
