const pa11y = require('pa11y');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const chalk = require('chalk');
const ora = require('ora');

// Configuration constants - can be overridden by environment variables
const CONFIG = {
  // Concurrency and performance - reduced for better reliability
  MAX_CONCURRENT_CHECKS: parseInt(process.env.PA11Y_MAX_CONCURRENT) || 1,
  BATCH_SIZE: parseInt(process.env.PA11Y_BATCH_SIZE) || 3,
  DELAY_BETWEEN_REQUESTS: parseInt(process.env.PA11Y_REQUEST_DELAY) || 5000, // 5 seconds
  
  // Timeouts - increased for better reliability
  PAGE_TIMEOUT: parseInt(process.env.PA11Y_PAGE_TIMEOUT) || 90000, // 90 seconds
  PAGE_WAIT: parseInt(process.env.PA11Y_PAGE_WAIT) || 3000, // 3 seconds
  NAVIGATION_TIMEOUT: parseInt(process.env.PA11Y_NAV_TIMEOUT) || 90000, // 90 seconds
  
  // Retry configuration
  MAX_RETRIES: parseInt(process.env.PA11Y_MAX_RETRIES) || 3,
  INITIAL_RETRY_DELAY: parseInt(process.env.PA11Y_RETRY_DELAY) || 5000, // 5 seconds
  RETRY_MULTIPLIER: parseFloat(process.env.PA11Y_RETRY_MULTIPLIER) || 2,
  
  // Browser configuration - optimized for stability
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-blink-features=AutomationControlled',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-images', // Disable images to speed up loading
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--disable-hang-monitor',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-default-apps',
    '--disable-sync',
  ]
};

/**
 * Process input URL to get the sitemap URL
 */
function processSitemapUrl(input) {
  if (!input) {
    console.error(chalk.red('\nError: Please provide a WordPress website URL'));
    console.log(chalk.yellow('\nUsage:'));
    console.log(chalk.gray('  node audit.js yourwordpresssite.com'));
    console.log(chalk.gray('  node audit.js https://yourwordpresssite.com'));
    console.log(chalk.gray('  node audit.js https://yourwordpresssite.com/sitemap_index.xml'));
    process.exit(1);
  }

  let url = input.trim();
  
  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // If it already ends with sitemap.xml or sitemap_index.xml, use as is
  if (url.endsWith('.xml')) {
    return url;
  }
  
  // Remove trailing slash
  url = url.replace(/\/$/, '');
  
  // Add standard WordPress sitemap path
  return url + '/sitemap_index.xml';
}

// Get website URL from command line
const inputUrl = process.argv[2];
const sitemapUrl = processSitemapUrl(inputUrl);

/**
 * Simple concurrency limiter without external dependencies
 */
class ConcurrencyLimiter {
  constructor(limit) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject
      });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.limit || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

// Create a concurrency limiter
const limiter = new ConcurrencyLimiter(CONFIG.MAX_CONCURRENT_CHECKS);

// Track browser instances for cleanup
const browserInstances = new Set();

/**
 * Cleanup function to close all browser instances
 */
async function cleanup() {
  console.log(chalk.yellow('\n🧹 Cleaning up browser instances...'));
  for (const browser of browserInstances) {
    try {
      await browser.close();
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  browserInstances.clear();
}

// Handle process termination
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

/**
 * Delay helper function
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch and parse XML content with retry
 */
async function fetchXML(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 30000,
        maxRedirects: 5
      });
      const parser = new xml2js.Parser();
      return await parser.parseStringPromise(response.data);
    } catch (error) {
      if (attempt < retries) {
        const delayMs = 1000 * (attempt + 1);
        console.warn(chalk.yellow(`Retry ${attempt + 1}/${retries} for ${url} after ${delayMs}ms`));
        await delay(delayMs);
      } else {
        console.error(chalk.red(`Error fetching ${url}:`), error.message);
        return null;
      }
    }
  }
}

/**
 * Extract all URLs from a sitemap
 */
function extractUrlsFromSitemap(sitemapData) {
  const urls = [];
  
  if (sitemapData?.urlset?.url) {
    // Regular sitemap
    sitemapData.urlset.url.forEach(urlItem => {
      if (urlItem.loc && urlItem.loc[0]) {
        urls.push(urlItem.loc[0]);
      }
    });
  }
  
  return urls;
}

/**
 * Get all sitemaps from sitemap index
 */
async function getSitemapsFromIndex(indexData) {
  const sitemaps = [];
  
  if (indexData?.sitemapindex?.sitemap) {
    indexData.sitemapindex.sitemap.forEach(sitemapItem => {
      if (sitemapItem.loc && sitemapItem.loc[0]) {
        sitemaps.push(sitemapItem.loc[0]);
      }
    });
  }
  
  return sitemaps;
}

/**
 * Fetch all URLs from the WordPress site
 */
async function getAllUrls() {
  const spinner = ora('Fetching sitemap index...').start();
  const allUrls = new Set(); // Use Set to automatically handle duplicates
  
  try {
    // Fetch sitemap index
    const indexData = await fetchXML(sitemapUrl);
    if (!indexData) {
      spinner.fail('Failed to fetch sitemap index');
      return [];
    }
    
    // Get all sub-sitemaps
    const sitemaps = await getSitemapsFromIndex(indexData);
    spinner.succeed(`Found ${sitemaps.length} sitemaps`);
    
    // Fetch each sitemap and extract URLs
    for (const sitemapUrl of sitemaps) {
      const subSpinner = ora(`Fetching ${sitemapUrl}...`).start();
      const sitemapData = await fetchXML(sitemapUrl);
      
      if (sitemapData) {
        const urls = extractUrlsFromSitemap(sitemapData);
        urls.forEach(url => allUrls.add(url));
        subSpinner.succeed(`Extracted ${urls.length} URLs from ${sitemapUrl}`);
      } else {
        subSpinner.warn(`Failed to fetch ${sitemapUrl}`);
      }
    }
    
    // Also check if the main URL is a direct sitemap (not an index)
    const urls = extractUrlsFromSitemap(indexData);
    urls.forEach(url => allUrls.add(url));
    
    console.log(chalk.green(`\n✓ Total unique URLs found: ${allUrls.size}`));
    return Array.from(allUrls);
  } catch (error) {
    spinner.fail('Error processing sitemaps');
    console.error(error);
    return [];
  }
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  
  // List of retryable error patterns
  const retryablePatterns = [
    'timeout',
    'timed out',
    'navigation timeout',
    'net::err',
    'econnreset',
    'econnrefused',
    'socket hang up',
    'empty response',
    'protocol error',
    'target closed',
    'session closed',
    'page crashed',
    'abnormal',
    'failed action',
    'wait for',
  ];
  
  return retryablePatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Run pa11y accessibility checks on a URL with retry logic
 */
async function runAccessibilityCheck(url, attemptNumber = 1) {
  try {
    // Add some randomness to prevent all checks from hitting at the same time
    if (attemptNumber > 1) {
      const jitter = Math.random() * 2000; // 0-2 second random delay
      await delay(jitter);
    }
    
    const results = await pa11y(url, {
      standard: 'WCAG2AA',
      timeout: CONFIG.PAGE_TIMEOUT,
      wait: CONFIG.PAGE_WAIT,
      includeWarnings: true,
      includeNotices: false,
      chromeLaunchConfig: {
        args: CONFIG.BROWSER_ARGS,
        timeout: CONFIG.NAVIGATION_TIMEOUT,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        defaultViewport: {
          width: 1280,
          height: 1024
        },
        ignoreHTTPSErrors: true,
      },
      viewport: {
        width: 1280,
        height: 1024,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      // Don't use actions as they cause failures, use wait instead
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ignoreHTTPSErrors: true,
    });
    
    // Track browser instance for cleanup
    if (results.browser) {
      browserInstances.add(results.browser);
    }
    
    return {
      url,
      issues: results.issues || [],
      status: 'success',
      documentTitle: results.documentTitle || url,
      attempts: attemptNumber
    };
  } catch (error) {
    const isRetryable = isRetryableError(error);
    
    if (isRetryable && attemptNumber < CONFIG.MAX_RETRIES) {
      const retryDelay = CONFIG.INITIAL_RETRY_DELAY * Math.pow(CONFIG.RETRY_MULTIPLIER, attemptNumber - 1);
      console.warn(
        chalk.yellow(`⚠️  Retrying ${url} (attempt ${attemptNumber + 1}/${CONFIG.MAX_RETRIES}) after ${retryDelay}ms...`)
      );
      console.warn(chalk.gray(`   Error: ${error.message}`));
      
      await delay(retryDelay);
      return runAccessibilityCheck(url, attemptNumber + 1);
    }
    
    console.error(chalk.red(`❌ Error checking ${url} after ${attemptNumber} attempts:`), error.message);
    return {
      url,
      issues: [],
      status: 'error',
      error: error.message,
      documentTitle: url,
      attempts: attemptNumber,
      isRetryable
    };
  }
}

/**
 * Process URLs in batches
 */
async function processUrlBatch(urls, startIndex, totalUrls) {
  const results = [];
  const promises = urls.map((url, index) => 
    limiter.run(async () => {
      const globalIndex = startIndex + index + 1;
      const spinner = ora(`[${globalIndex}/${totalUrls}] Checking ${url}...`).start();
      
      try {
        const result = await runAccessibilityCheck(url);
        
        if (result.status === 'success') {
          if (result.issues.length === 0) {
            spinner.succeed(
              `[${globalIndex}/${totalUrls}] ${url} - No issues found` +
              (result.attempts > 1 ? chalk.gray(` (${result.attempts} attempts)`) : '')
            );
          } else {
            spinner.warn(
              `[${globalIndex}/${totalUrls}] ${url} - ${result.issues.length} issues found` +
              (result.attempts > 1 ? chalk.gray(` (${result.attempts} attempts)`) : '')
            );
          }
        } else {
          spinner.fail(
            `[${globalIndex}/${totalUrls}] ${url} - Check failed` +
            (result.attempts > 1 ? chalk.gray(` (${result.attempts} attempts)`) : '')
          );
        }
        
        // Add delay between requests to avoid rate limiting
        await delay(CONFIG.DELAY_BETWEEN_REQUESTS);
        
        return result;
      } catch (error) {
        spinner.fail(`[${globalIndex}/${totalUrls}] ${url} - Unexpected error`);
        return {
          url,
          issues: [],
          status: 'error',
          error: error.message,
          documentTitle: url,
          attempts: 1
        };
      }
    })
  );
  
  const batchResults = await Promise.all(promises);
  results.push(...batchResults);
  
  return results;
}

/**
 * Generate HTML report from results
 */
function generateHTMLReport(results, totalUrls, domain) {
  const timestamp = new Date().toLocaleString();
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const failedChecks = results.filter(r => r.status === 'error').length;
  const successfulChecks = results.filter(r => r.status === 'success').length;
  
  // Group issues by type
  const issuesByType = {
    error: 0,
    warning: 0,
    notice: 0
  };
  
  results.forEach(result => {
    result.issues.forEach(issue => {
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    });
  });
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accessibility Audit Report - ${domain || sitemapUrl}</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        
        .header {
            background: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        
        h1 {
            margin: 0 0 20px 0;
            color: #2c3e50;
        }
        
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .stat-card h3 {
            margin: 0 0 10px 0;
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
        }
        
        .stat-card .value {
            font-size: 36px;
            font-weight: bold;
            margin: 0;
        }
        
        .stat-card.error .value { color: #e74c3c; }
        .stat-card.warning .value { color: #f39c12; }
        .stat-card.success .value { color: #27ae60; }
        
        .page-result {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }
        
        .page-title {
            font-size: 18px;
            font-weight: bold;
            color: #2c3e50;
            margin: 0;
        }
        
        .page-url {
            font-size: 14px;
            color: #666;
            word-break: break-all;
        }
        
        .issue-count {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
        }
        
        .issue-count.clean { background: #d4edda; color: #155724; }
        .issue-count.has-issues { background: #f8d7da; color: #721c24; }
        .issue-count.error { background: #f8d7da; color: #721c24; }
        
        .issues-list {
            margin-top: 20px;
        }
        
        .issue {
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 6px;
            border-left: 4px solid;
        }
        
        .issue.error {
            background: #fee;
            border-color: #e74c3c;
        }
        
        .issue.warning {
            background: #fff8e1;
            border-color: #f39c12;
        }
        
        .issue.notice {
            background: #e8f5e9;
            border-color: #4caf50;
        }
        
        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }
        
        .issue-type {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            color: white;
        }
        
        .issue-type.error { background: #e74c3c; }
        .issue-type.warning { background: #f39c12; }
        .issue-type.notice { background: #4caf50; }
        
        .issue-code {
            font-size: 12px;
            color: #666;
            font-family: monospace;
        }
        
        .issue-message {
            margin: 10px 0;
            font-weight: 500;
        }
        
        .issue-context {
            background: #f8f8f8;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            overflow-x: auto;
            white-space: pre-wrap;
            margin: 10px 0;
        }
        
        .issue-selector {
            font-size: 12px;
            color: #666;
            font-family: monospace;
        }
        
        .no-issues {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        .error-message {
            background: #fee;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #e74c3c;
            color: #721c24;
        }
        
        .retry-info {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Accessibility Audit Report</h1>
        <p><strong>Site:</strong> ${domain || 'Unknown'}</p>
        <p><strong>Generated:</strong> ${timestamp}</p>
        <p><strong>Standard:</strong> WCAG 2.1 Level AA</p>
        <p><strong>Configuration:</strong> Max ${CONFIG.MAX_RETRIES} retries, ${CONFIG.PAGE_TIMEOUT/1000}s timeout, ${CONFIG.MAX_CONCURRENT_CHECKS} concurrent checks</p>
    </div>
    
    <div class="summary">
        <div class="stat-card">
            <h3>Pages Scanned</h3>
            <p class="value">${totalUrls}</p>
        </div>
        <div class="stat-card success">
            <h3>Successful Checks</h3>
            <p class="value">${successfulChecks}</p>
        </div>
        <div class="stat-card error">
            <h3>Failed Checks</h3>
            <p class="value">${failedChecks}</p>
        </div>
        <div class="stat-card">
            <h3>Total Issues</h3>
            <p class="value">${totalIssues}</p>
        </div>
        <div class="stat-card error">
            <h3>Errors</h3>
            <p class="value">${issuesByType.error || 0}</p>
        </div>
        <div class="stat-card warning">
            <h3>Warnings</h3>
            <p class="value">${issuesByType.warning || 0}</p>
        </div>
    </div>
    
    ${results.map(result => `
        <div class="page-result">
            <div class="page-header">
                <div>
                    <h2 class="page-title">${result.documentTitle}</h2>
                    <p class="page-url">${result.url}</p>
                    ${result.attempts > 1 ? `<p class="retry-info">Completed after ${result.attempts} attempts</p>` : ''}
                </div>
                ${result.status === 'error' 
                    ? '<span class="issue-count error">Check Failed</span>'
                    : result.issues.length === 0 
                        ? '<span class="issue-count clean">No Issues</span>'
                        : `<span class="issue-count has-issues">${result.issues.length} Issue${result.issues.length !== 1 ? 's' : ''}</span>`
                }
            </div>
            
            ${result.status === 'error'
                ? `<div class="error-message">Error: ${result.error}</div>`
                : result.issues.length === 0
                    ? '<div class="no-issues">✓ No accessibility issues found</div>'
                    : `<div class="issues-list">
                        ${result.issues.map(issue => `
                            <div class="issue ${issue.type}">
                                <div class="issue-header">
                                    <span class="issue-type ${issue.type}">${issue.type}</span>
                                    <span class="issue-code">${issue.code}</span>
                                </div>
                                <div class="issue-message">${issue.message}</div>
                                ${issue.context ? `<div class="issue-context">${escapeHtml(issue.context)}</div>` : ''}
                                ${issue.selector ? `<div class="issue-selector">Selector: ${issue.selector}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>`
            }
        </div>
    `).join('')}
</body>
</html>`;
  
  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Main function
 */
async function main() {
  console.log(chalk.cyan('\n🔍 WordPress Accessibility Audit (Enhanced)\n'));
  
  // Extract domain from sitemap URL for display
  let domain;
  try {
    const url = new URL(sitemapUrl);
    domain = url.hostname;
  } catch (e) {
    domain = sitemapUrl;
  }
  
  console.log(chalk.gray(`Website: ${domain}`));
  console.log(chalk.gray(`Sitemap: ${sitemapUrl}`));
  console.log(chalk.gray(`\nConfiguration:`));
  console.log(chalk.gray(`  - Max concurrent checks: ${CONFIG.MAX_CONCURRENT_CHECKS}`));
  console.log(chalk.gray(`  - Batch size: ${CONFIG.BATCH_SIZE}`));
  console.log(chalk.gray(`  - Max retries: ${CONFIG.MAX_RETRIES}`));
  console.log(chalk.gray(`  - Page timeout: ${CONFIG.PAGE_TIMEOUT/1000}s`));
  console.log(chalk.gray(`  - Delay between requests: ${CONFIG.DELAY_BETWEEN_REQUESTS/1000}s`));
  console.log(chalk.yellow(`\n⚠️  Note: Using conservative settings for maximum reliability\n`));
  
  // First, verify the sitemap exists
  console.log(chalk.gray('Verifying sitemap accessibility...\n'));
  try {
    await axios.head(sitemapUrl, { timeout: 10000 });
  } catch (error) {
    console.error(chalk.red('\n❌ Error: Unable to access sitemap at ' + sitemapUrl));
    console.error(chalk.yellow('\nPossible reasons:'));
    console.error(chalk.gray('  1. The website does not have a sitemap at the standard location'));
    console.error(chalk.gray('  2. The website URL is incorrect'));
    console.error(chalk.gray('  3. The website is not accessible'));
    console.error(chalk.gray('\nTry specifying the full sitemap URL directly:'));
    console.error(chalk.gray(`  node audit.js ${sitemapUrl.replace('/sitemap_index.xml', '/sitemap.xml')}`));
    process.exit(1);
  }
  
  // Get all URLs from sitemap
  const urls = await getAllUrls();
  
  if (urls.length === 0) {
    console.error(chalk.red('\n❌ No URLs found in the sitemap'));
    console.error(chalk.yellow('\nThe sitemap exists but contains no URLs.'));
    console.error(chalk.gray('This might happen if:'));
    console.error(chalk.gray('  1. The sitemap is empty'));
    console.error(chalk.gray('  2. The sitemap format is not standard'));
    console.error(chalk.gray('  3. The website uses a different sitemap structure'));
    process.exit(1);
  }
  
  console.log(chalk.cyan(`\n🏃 Running accessibility checks on ${urls.length} URLs...\n`));
  
  // Process URLs in batches
  const results = [];
  const batches = Math.ceil(urls.length / CONFIG.BATCH_SIZE);
  
  for (let i = 0; i < batches; i++) {
    const startIdx = i * CONFIG.BATCH_SIZE;
    const endIdx = Math.min(startIdx + CONFIG.BATCH_SIZE, urls.length);
    const batch = urls.slice(startIdx, endIdx);
    
    console.log(chalk.cyan(`\n📦 Processing batch ${i + 1}/${batches} (URLs ${startIdx + 1}-${endIdx})...\n`));
    
    const batchResults = await processUrlBatch(batch, startIdx, urls.length);
    results.push(...batchResults);
    
    // Add delay between batches
    if (i < batches - 1) {
      console.log(chalk.gray(`\n⏳ Waiting before next batch...\n`));
      await delay(CONFIG.DELAY_BETWEEN_REQUESTS * 2);
    }
  }
  
  // Clean up browser instances
  await cleanup();
  
  // Generate HTML report
  console.log(chalk.cyan('\n📊 Generating HTML report...\n'));
  const htmlReport = generateHTMLReport(results, urls.length, domain);
  
  // Save report
  const reportPath = path.join(process.cwd(), 'report.html');
  await fs.writeFile(reportPath, htmlReport);
  
  console.log(chalk.green(`✓ Report saved to: ${reportPath}`));
  
  // Summary
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const failedChecks = results.filter(r => r.status === 'error').length;
  const successfulChecks = results.filter(r => r.status === 'success').length;
  const retriedChecks = results.filter(r => r.attempts > 1).length;
  
  console.log(chalk.cyan('\n📈 Summary:'));
  console.log(chalk.gray(`   Pages scanned: ${urls.length}`));
  console.log(chalk.green(`   Successful checks: ${successfulChecks}`));
  console.log(chalk.red(`   Failed checks: ${failedChecks}`));
  console.log(chalk.yellow(`   Checks with retries: ${retriedChecks}`));
  console.log(chalk.gray(`   Total issues: ${totalIssues}`));
  
  if (totalIssues > 0) {
    const issueTypes = {};
    results.forEach(r => {
      r.issues.forEach(issue => {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      });
    });
    console.log(chalk.gray(`   Errors: ${issueTypes.error || 0}`));
    console.log(chalk.gray(`   Warnings: ${issueTypes.warning || 0}`));
  }
  
  console.log(chalk.green('\n✓ Audit complete!\n'));
  
  // Exit explicitly to ensure all processes are terminated
  process.exit(0);
}

// Run the main function
main().catch(error => {
  console.error(chalk.red('Unexpected error:'), error);
  cleanup().then(() => process.exit(1));
});