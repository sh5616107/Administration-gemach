/**
 * Bank Scraper Sidecar - Main Entry Point
 * 
 * This sidecar process communicates with the Tauri backend via stdin/stdout using JSON.
 * It handles bank scraping operations using the israeli-bank-scrapers library.
 */

const scraper = require('./scraper');

/**
 * Send response back to Tauri backend via stdout
 */
function sendResponse(id, result, error = null) {
  const response = {
    id,
    result: error ? null : result,
    error: error
      ? {
          message: error.message || String(error),
          code: error.code || 'UNKNOWN_ERROR',
          stack: error.stack,
        }
      : null,
  };

  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * Process incoming command from Tauri backend
 */
async function processCommand(data) {
  process.stderr.write('[INDEX] Got command: ' + data.command + ' params keys: ' + Object.keys(data.params || {}).join(',') + '\n');
  const { id, command, params } = data;

  try {
    switch (command) {
      case 'scrape': {
        const result = await scraper.scrapeBank(params);
        sendResponse(id, result);
        break;
      }
      case 'test_connection': {
        const testResult = await scraper.testConnection(params);
        sendResponse(id, testResult);
        break;
      }
      case 'get_supported_banks': {
        const banks = scraper.getSupportedBanks();
        sendResponse(id, { banks });
        break;
      }
      case 'ping': {
        sendResponse(id, { status: 'ok', timestamp: Date.now() });
        break;
      }
      default:
        throw Object.assign(new Error(`Unknown command: ${command}`), { code: 'UNKNOWN_COMMAND' });
    }
  } catch (error) {
    process.stderr.write('[INDEX] Command failed: ' + (error.stack || error.message || String(error)) + '\n');
    sendResponse(id || null, null, error);
  }
}

let inputBuffer = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;

  let newlineIndex;
  while ((newlineIndex = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);

    if (!line) continue;

    let data;
    try {
      data = JSON.parse(line);
    } catch (error) {
      sendResponse(null, null, {
        message: 'Invalid JSON: ' + error.message,
        code: 'JSON_PARSE_ERROR',
      });
      continue;
    }

    processCommand(data).catch((err) => {
      process.stderr.write('[INDEX] Unhandled error: ' + (err.stack || err.message || String(err)) + '\n');
    });
  }
});

process.stdin.on('end', () => {
  process.stderr.write('[INDEX] stdin closed, exiting\n');
  process.exit(0);
});

const keepAlive = setInterval(() => {}, 60_000);

process.on('SIGTERM', () => {
  clearInterval(keepAlive);
  process.exit(0);
});

process.on('SIGINT', () => {
  clearInterval(keepAlive);
  process.exit(0);
});

process.stderr.write('Bank scraper sidecar started successfully\n');
