/**
 * Bank Scraper Module
 * 
 * Wrapper around israeli-bank-scrapers library with enhanced error handling
 * and progress reporting.
 */

const { createScraper, CompanyTypes, SCRAPERS } = require('israeli-bank-scrapers');

/**
 * Get list of supported banks from israeli-bank-scrapers
 */
function getSupportedBanks() {
  const banks = [];
  
  // Get scrapers metadata from the library
  for (const [companyId, metadata] of Object.entries(SCRAPERS)) {
    banks.push({
      id: companyId,
      name: metadata.name,
      displayName: getDisplayName(companyId),
      loginFields: metadata.loginFields,
      requiresIdNumber: metadata.loginFields.includes('id') || metadata.loginFields.includes('nationalID')
    });
  }
  
  return banks;
}

/**
 * Get display name for bank (Hebrew)
 */
function getDisplayName(companyId) {
  const names = {
    hapoalim: 'בנק הפועלים',
    leumi: 'בנק לאומי',
    discount: 'בנק דיסקונט',
    mizrahi: 'בנק מזרחי טפחות',
    isracard: 'ישראכרט',
    visaCal: 'ויזה כאל',
    max: 'מקס',
    leumiCard: 'לאומי כרטיסים',
    yahav: 'בנק יהב',
    union: 'בנק האיגוד',
    amex: 'אמריקן אקספרס',
    beyahadBishvilha: 'ביחד בשבילך',
    massad: 'בנק מסד',
    mercantile: 'בנק מרכנתיל',
    otsar: 'בנק אוצר החייל',
    beinleumi: 'בנק בינלאומי',
    oneZero: 'OneZero',
    behatsdaa: 'בהצדעה'
  };
  
  return names[companyId] || companyId;
}

function safePreview(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return {
    type: typeof value,
    length: text.length,
    preview: text.slice(0, 2) + (text.length > 2 ? '***' : ''),
  };
}

function redactCredentials(credentials) {
  const redacted = {};
  for (const [key, value] of Object.entries(credentials || {})) {
    redacted[key] = safePreview(value);
  }
  return redacted;
}

function getLoginFields(companyId) {
  return SCRAPERS[companyId]?.loginFields || [];
}

function validateCredentials(companyId, credentials) {
  const loginFields = getLoginFields(companyId);
  const missing = loginFields.filter((field) => {
    const value = credentials?.[field];
    return value === null || value === undefined || String(value).trim() === '';
  });

  if (missing.length > 0) {
    const error = new Error(`Missing required credentials for ${companyId}: ${missing.join(', ')}`);
    error.code = 'MISSING_CREDENTIALS';
    error.missingFields = missing;
    throw error;
  }
}

function asArray(value, context) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) {
    process.stderr.write(`[SCRAPER] ${context} is empty; using []\n`);
    return [];
  }

  process.stderr.write(`[SCRAPER] ${context} expected array, got ${typeof value}; using []\n`);
  return [];
}

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function safeAmount(value, fallback) {
  const amount = value ?? fallback;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
}

/**
 * Test bank connection with minimal data fetch
 */
async function testConnection(params) {
  const { companyId, credentials } = params;
  const mappedCredentials = mapCredentials(credentials);
  
  try {
    const options = {
      companyId,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
      combineInstallments: false,
      showBrowser: false,
      verbose: false
    };
    
    const scraper = createScraper(options);
    validateCredentials(companyId, mappedCredentials);
    
    // Try to scrape - if successful, connection works
    const scrapeResult = await scraper.scrape(mappedCredentials);
    
    if (scrapeResult.success) {
      return {
        success: true,
        message: 'התחברות הצליחה'
      };
    } else {
      return {
        success: false,
        errorCode: scrapeResult.errorType || 'AUTH_FAILED',
        errorMessage: scrapeResult.errorMessage || 'שגיאת אימות'
      };
    }
  } catch (error) {
    console.error('[SCRAPER] testConnection failed:', error.stack || error.message);
    return {
      success: false,
      errorCode: error.code || 'CONNECTION_ERROR',
      errorMessage: error.message,
      errorStack: error.stack
    };
  }
}

/**
 * Scrape bank transactions
 */
async function scrapeBank(params) {
  process.stderr.write('[SCRAPER] scrapeBank called! showBrowser=' + params.showBrowser + '\n');
  const { companyId, credentials, startDate, endDate } = params;
  const mappedCredentials = mapCredentials(credentials);
  const showBrowser = params.showBrowser === true;

  let browser = null;

  try {
    if (showBrowser) {
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--window-position=100,100', '--window-size=1200,800'],
      });
      process.stderr.write('[SCRAPER] Browser launched manually\n');
    }

    const options = {
      companyId,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : new Date(),
      combineInstallments: false,
      showBrowser,
      skipCloseBrowser: showBrowser,
      verbose: false,
      ...(browser && { browser }),
      browserArgs: ['--window-position=100,100', '--window-size=1200,800'],
    };
    
    // DEBUG LOGS
    console.error('[SCRAPER] showBrowser =', options.showBrowser);
    console.error('[SCRAPER] skipCloseBrowser =', options.skipCloseBrowser);
    console.error('[SCRAPER] companyId =', options.companyId);
    console.error('[SCRAPER] Full options =', JSON.stringify(options, null, 2));
    console.error('[SCRAPER] Raw credential keys:', Object.keys(credentials || {}));
    console.error('[SCRAPER] Mapped credentials (redacted):', JSON.stringify(redactCredentials(mappedCredentials)));
    
    const scraper = createScraper(options);
    validateCredentials(companyId, mappedCredentials);
    
    // DEBUG: Hook into scraper progress to see what's happening
    scraper.onProgress((result) => {
      console.error('[SCRAPER_PROGRESS]', result);
    });
    
    console.error('[SCRAPER] About to call scraper.scrape() with credentials');
    console.error('[SCRAPER] Credentials keys:', Object.keys(mappedCredentials));
    
    // Scrape transactions
    const scrapeResult = await scraper.scrape(mappedCredentials);
    
    // Debug logging - use stderr to avoid corrupting IPC protocol
    console.error('[SCRAPER] Scrape result success:', scrapeResult.success);
    if (scrapeResult.success) {
      const scrapeAccounts = asArray(scrapeResult.accounts, 'scrapeResult.accounts');
      console.error('[SCRAPER] Number of accounts:', scrapeAccounts.length);
      scrapeAccounts.forEach((acc, idx) => {
        console.error(`[SCRAPER] Account ${idx}: ${safeText(acc?.accountNumber)}, transactions: ${asArray(acc?.txns, `account ${idx} txns`).length}`);
      });
    } else {
      console.error('[SCRAPER] Error:', scrapeResult.errorType, scrapeResult.errorMessage);
    }
    
    if (scrapeResult.success) {
      // Transform transactions to our format
      // Note: some banks return 'txns', others return 'pendingTxns' or both
      const accounts = asArray(scrapeResult.accounts, 'scrapeResult.accounts').map((account, accountIndex) => {
        const allTxns = [
          ...asArray(account?.txns, `account ${accountIndex} txns`),
          ...asArray(account?.pendingTxns, `account ${accountIndex} pendingTxns`),
        ];
        
        console.error(`[SCRAPER] Account ${safeText(account?.accountNumber)}: ${allTxns.length} total txns (${asArray(account?.txns, `account ${accountIndex} txns`).length} regular, ${asArray(account?.pendingTxns, `account ${accountIndex} pendingTxns`).length} pending)`);
        
        return {
          accountNumber: safeText(account?.accountNumber),
          balance: safeAmount(account?.balance, 0),
          currency: safeText(account?.currency) || 'ILS',
          transactions: allTxns.map(txn => ({
            type: safeText(txn?.type),
            date: txn?.date,
            processedDate: txn?.processedDate,
            originalAmount: safeAmount(txn?.originalAmount, 0),
            originalCurrency: safeText(txn?.originalCurrency),
            chargedAmount: safeAmount(txn?.chargedAmount, txn?.originalAmount),
            chargedCurrency: safeText(txn?.chargedCurrency) || 'ILS',
            description: safeText(txn?.description),
            memo: txn?.memo === undefined || txn?.memo === null ? undefined : safeText(txn.memo),
            identifier: txn?.identifier === undefined || txn?.identifier === null ? undefined : safeText(txn.identifier),
            category: txn?.category === undefined || txn?.category === null ? undefined : safeText(txn.category),
            status: txn?.status === undefined || txn?.status === null ? undefined : safeText(txn.status),
            installments: txn?.installments
          }))
        };
      });
      
      return {
        success: true,
        accounts,
        scrapedAt: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        errorCode: scrapeResult.errorType || 'SCRAPE_FAILED',
        errorMessage: scrapeResult.errorMessage || 'שגיאה בשליפת עסקאות'
      };
    }
  } catch (error) {
    console.error('[SCRAPER] scrapeBank failed:', error.stack || error.message);
    return {
      success: false,
      errorCode: error.code || 'SCRAPE_ERROR',
      errorMessage: error.message,
      errorStack: error.stack,
      missingFields: error.missingFields
    };
  }
}

/**
 * Map our snake_case credential fields to the camelCase fields
 * expected by israeli-bank-scrapers
 * 
 * Our format       → Library format
 * user_code        → userCode
 * id_number        → id
 * card_6_digits    → card6Digits
 * username         → username  (same)
 * password         → password  (same)
 * national_id      → nationalID
 * num              → num       (same)
 */
function mapCredentials(credentials) {
  if (!credentials) return {};
  
  const mapped = {};
  
  if (credentials.username)      mapped.username     = credentials.username;
  if (credentials.password)      mapped.password     = credentials.password;
  if (credentials.user_code)     mapped.userCode     = credentials.user_code;
  if (credentials.userCode)      mapped.userCode     = credentials.userCode;
  if (credentials.id_number)     mapped.id           = credentials.id_number;
  if (credentials.id)            mapped.id           = credentials.id;
  if (credentials.card_6_digits) mapped.card6Digits  = credentials.card_6_digits;
  if (credentials.card6Digits)   mapped.card6Digits  = credentials.card6Digits;
  if (credentials.num)           mapped.num          = credentials.num;
  if (credentials.national_id)   mapped.nationalID   = credentials.national_id;
  if (credentials.nationalID)    mapped.nationalID   = credentials.nationalID;
  if (credentials.email)         mapped.email        = credentials.email;
  if (credentials.phone_number)  mapped.phoneNumber  = credentials.phone_number;
  if (credentials.phoneNumber)   mapped.phoneNumber  = credentials.phoneNumber;
  
  return mapped;
}

module.exports = {
  getSupportedBanks,
  testConnection,
  scrapeBank
};
