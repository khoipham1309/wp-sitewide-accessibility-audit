const pa11y = require('pa11y');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const chalk = require('chalk');
const ora = require('ora');

// Get sitemap URL from command line or use default
const sitemapUrl = process.argv[2] || 'https://lamdongtrail.vn/sitemap_index.xml';

/**
 * Fetch and parse XML content
 */
async function fetchXML(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AccessibilityAudit/1.0)'
      }
    });
    const parser = new xml2js.Parser();
    return await parser.parseStringPromise(response.data);
  } catch (error) {
    console.error(chalk.red(`Error fetching ${url}:`), error.message);
    return null;
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
 * Run pa11y accessibility checks on a URL
 */
async function runAccessibilityCheck(url) {
  try {
    const results = await pa11y(url, {
      standard: 'WCAG2AA',
      timeout: 30000,
      wait: 1000,
      includeWarnings: true,
      includeNotices: false,
      chromeLaunchConfig: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    return {
      url,
      issues: results.issues,
      status: 'success',
      documentTitle: results.documentTitle || url
    };
  } catch (error) {
    console.error(chalk.red(`Error checking ${url}:`), error.message);
    return {
      url,
      issues: [],
      status: 'error',
      error: error.message,
      documentTitle: url
    };
  }
}

/**
 * Generate HTML report from results
 */
function generateHTMLReport(results, totalUrls) {
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
    <title>Accessibility Audit Report - ${sitemapUrl}</title>
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
    </style>
</head>
<body>
    <div class="header">
        <h1>Accessibility Audit Report</h1>
        <p><strong>Site:</strong> ${sitemapUrl}</p>
        <p><strong>Generated:</strong> ${timestamp}</p>
        <p><strong>Standard:</strong> WCAG 2.1 Level AA</p>
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
            <p class="value">${issuesByType.error}</p>
        </div>
        <div class="stat-card warning">
            <h3>Warnings</h3>
            <p class="value">${issuesByType.warning}</p>
        </div>
    </div>
    
    ${results.map(result => `
        <div class="page-result">
            <div class="page-header">
                <div>
                    <h2 class="page-title">${result.documentTitle}</h2>
                    <p class="page-url">${result.url}</p>
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
  console.log(chalk.cyan('\n🔍 WordPress Accessibility Audit\n'));
  console.log(chalk.gray(`Sitemap: ${sitemapUrl}\n`));
  
  // Get all URLs from sitemap
  const urls = await getAllUrls();
  
  if (urls.length === 0) {
    console.error(chalk.red('No URLs found to audit'));
    process.exit(1);
  }
  
  console.log(chalk.cyan(`\n🏃 Running accessibility checks on ${urls.length} URLs...\n`));
  
  // Run pa11y checks on each URL
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const spinner = ora(`[${i + 1}/${urls.length}] Checking ${url}...`).start();
    
    const result = await runAccessibilityCheck(url);
    results.push(result);
    
    if (result.status === 'success') {
      if (result.issues.length === 0) {
        spinner.succeed(`[${i + 1}/${urls.length}] ${url} - No issues found`);
      } else {
        spinner.warn(`[${i + 1}/${urls.length}] ${url} - ${result.issues.length} issues found`);
      }
    } else {
      spinner.fail(`[${i + 1}/${urls.length}] ${url} - Check failed`);
    }
  }
  
  // Generate HTML report
  console.log(chalk.cyan('\n📊 Generating HTML report...\n'));
  const htmlReport = generateHTMLReport(results, urls.length);
  
  // Save report
  const reportPath = path.join(process.cwd(), 'report.html');
  await fs.writeFile(reportPath, htmlReport);
  
  console.log(chalk.green(`✓ Report saved to: ${reportPath}`));
  
  // Summary
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const failedChecks = results.filter(r => r.status === 'error').length;
  
  console.log(chalk.cyan('\n📈 Summary:'));
  console.log(chalk.gray(`   Pages scanned: ${urls.length}`));
  console.log(chalk.gray(`   Total issues: ${totalIssues}`));
  console.log(chalk.gray(`   Failed checks: ${failedChecks}`));
  
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
}

// Run the main function
main().catch(error => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
});
