# WordPress Accessibility Audit Tool (Enhanced)

A robust and reliable Node.js script that performs comprehensive accessibility audits on WordPress sites. Simply provide any WordPress website URL, and the tool will automatically detect the sitemap, run pa11y checks on all pages, and generate a detailed HTML report. This enhanced version includes automatic retry logic, concurrency control, and configurable settings to minimize timeouts and failures.

## Features

### Core Features
- Automatically parses WordPress sitemap index and all sub-sitemaps
- Extracts all unique URLs from posts, pages, categories, tags, and authors
- Runs WCAG 2.1 Level AA accessibility checks on each URL
- Generates a comprehensive HTML report with:
  - Summary statistics
  - Detailed issues per page
  - WCAG violation references
  - HTML context snippets
  - Issue severity levels (errors, warnings)

### Reliability Enhancements
- **🔄 Automatic Retry Logic**: Failed checks are retried up to 3 times with exponential backoff
- **⚡ Concurrent Processing**: Configurable batch processing for faster scans
- **⏱️ Extended Timeouts**: 60-second default timeout (configurable) to handle slow pages
- **🛡️ Enhanced Browser Stability**: Optimized Chrome flags for better reliability
- **📉 Rate Limiting Protection**: Configurable delays between requests
- **🧹 Automatic Cleanup**: Proper browser instance management
- **📊 Retry Statistics**: Report shows which pages needed retries

## Prerequisites

- Node.js 14.0.0 or higher
- npm or yarn

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Quick Start

For a quick overview of how to use the tool:

```bash
npm run help
```

Or run a website audit immediately:

```bash
node audit.js yourwordpresssite.com
```

## Usage

### Basic Usage

To audit any WordPress website, provide the website URL:

```bash
node audit.js yourwordpresssite.com
```

The tool accepts URLs in multiple formats:

```bash
# Without protocol (https:// will be added automatically)
node audit.js yourwordpresssite.com

# With protocol
node audit.js https://yourwordpresssite.com

# Direct sitemap URL (if non-standard location)
node audit.js https://yourwordpresssite.com/custom-sitemap.xml
```

The tool will automatically append `/sitemap_index.xml` to the base URL to find the WordPress sitemap.

### Using npm scripts

NPM scripts are available but require you to pass the website URL:

```bash
# Run audit with website URL
npm run audit -- yourwordpresssite.com

# Run audit and automatically open report in browser
npm run audit:open -- yourwordpresssite.com

# Run audit in maximum reliability mode
npm run audit:reliable -- yourwordpresssite.com

# Run audit in reliability mode and open report
npm run audit:reliable:open -- yourwordpresssite.com

# Run example programmatic usage
npm run example -- yourwordpresssite.com
```

**Note:** The double dash (`--`) is required when passing arguments to npm scripts.

### Additional Scripts

- **audit-and-open.js**: Runs the audit and automatically opens the report in your default browser
- **run-reliable-audit.js**: Runs the audit with pre-configured settings for maximum reliability
- **example-usage.js**: Shows how to use the audit script programmatically in CI/CD pipelines

All scripts require a website URL as an argument:

```bash
node audit-and-open.js yourwordpresssite.com
node run-reliable-audit.js yourwordpresssite.com
node example-usage.js yourwordpresssite.com
```

## Output

The script generates a `report.html` file in the current directory containing:

- **Summary Statistics**: Total pages scanned, successful/failed checks, total issues
- **Issue Breakdown**: Count of errors and warnings
- **Page-by-Page Results**: Each page with its accessibility issues
- **Issue Details**: 
  - Issue type (error/warning)
  - WCAG code reference
  - Descriptive message
  - HTML context snippet
  - CSS selector

## Report Structure

The HTML report includes:

1. **Header Section**
   - Site URL
   - Generation timestamp
   - WCAG standard used

2. **Summary Cards**
   - Pages scanned
   - Successful checks
   - Failed checks
   - Total issues
   - Errors count
   - Warnings count

3. **Detailed Results**
   - Each page with its title and URL
   - List of all accessibility issues
   - Context and selectors for debugging

## Configuration

### Default Settings
The script uses these pa11y settings:
- Standard: WCAG 2.1 Level AA
- Timeout: 60 seconds per page (configurable)
- Wait: 2 seconds after page load (configurable)
- Includes warnings (but not notices)
- Max retries: 3 attempts per URL
- Concurrent checks: 2 (configurable)
- Delay between requests: 2 seconds

### Environment Variables
You can customize the behavior using environment variables:

```bash
# Concurrency and Performance
PA11Y_MAX_CONCURRENT=3          # Max simultaneous checks (default: 2)
PA11Y_BATCH_SIZE=10             # URLs per batch (default: 5)
PA11Y_REQUEST_DELAY=3000        # Delay between requests in ms (default: 2000)

# Timeouts
PA11Y_PAGE_TIMEOUT=90000        # Page load timeout in ms (default: 60000)
PA11Y_PAGE_WAIT=3000           # Wait after page load in ms (default: 2000)
PA11Y_NAV_TIMEOUT=90000        # Navigation timeout in ms (default: 60000)

# Retry Configuration
PA11Y_MAX_RETRIES=5            # Max retry attempts (default: 3)
PA11Y_RETRY_DELAY=10000        # Initial retry delay in ms (default: 5000)
PA11Y_RETRY_MULTIPLIER=1.5     # Retry delay multiplier (default: 2)
```

### Example with Custom Configuration

```bash
# Run with increased concurrency and timeouts
PA11Y_MAX_CONCURRENT=5 PA11Y_PAGE_TIMEOUT=120000 node audit.js yourwordpresssite.com

# Run with maximum reliability settings
PA11Y_MAX_CONCURRENT=1 PA11Y_MAX_RETRIES=5 PA11Y_REQUEST_DELAY=5000 node audit.js yourwordpresssite.com
```

## Why Custom Report Generation?

This tool uses custom HTML report generation instead of standard pa11y reporters because:

1. **Multi-page aggregation**: Standard pa11y reporters (pa11y-reporter-html, pa11y-reporter-html-plus) are designed for single-page reports. We need to aggregate results from multiple URLs.

2. **Summary statistics**: We calculate and display totals across all pages (total issues, errors, warnings, etc.)

3. **Unified report**: All results are combined into a single `report.html` file with navigation and filtering

4. **Custom formatting**: The report includes WordPress-specific context and better organization for multi-page audits

## Troubleshooting

### Common Issues and Solutions

1. **Timeout errors**: 
   - The enhanced version automatically retries timed-out pages
   - Increase timeout: `PA11Y_PAGE_TIMEOUT=120000 node audit.js`
   - Reduce concurrent checks: `PA11Y_MAX_CONCURRENT=1 node audit.js`

2. **Network errors**: 
   - The script now includes retry logic for network failures
   - Increase retry attempts: `PA11Y_MAX_RETRIES=5 node audit.js`
   - Add more delay: `PA11Y_REQUEST_DELAY=5000 node audit.js`

3. **Memory issues**: 
   - For very large sites, increase Node.js memory:
   ```bash
   node --max-old-space-size=4096 audit.js yoursite.com
   ```
   - Reduce batch size: `PA11Y_BATCH_SIZE=3 node audit.js yoursite.com`

4. **Rate limiting**: 
   - Increase delay between requests: `PA11Y_REQUEST_DELAY=5000 node audit.js yoursite.com`
   - Reduce concurrent checks: `PA11Y_MAX_CONCURRENT=1 node audit.js yoursite.com`

5. **Sitemap not found**: 
   - The tool looks for `/sitemap_index.xml` by default
   - If your WordPress site uses a different sitemap location, provide the full URL:
   ```bash
   node audit.js https://yoursite.com/sitemap.xml
   node audit.js https://yoursite.com/wp-sitemap.xml
   ```

### Error Handling

The enhanced script provides robust error handling:
- **Automatic Retries**: Failed checks are retried with exponential backoff
- **Error Classification**: Distinguishes between retryable and non-retryable errors
- **Graceful Degradation**: Failed pages don't stop the audit
- **Detailed Logging**: Shows retry attempts and specific error messages
- **Browser Cleanup**: Ensures all browser instances are closed on exit
- **Progress Tracking**: Real-time status updates with retry information

### Performance Tips

1. **For faster scans**: Increase concurrency
   ```bash
   PA11Y_MAX_CONCURRENT=5 PA11Y_BATCH_SIZE=10 node audit.js yoursite.com
   ```

2. **For more reliable scans**: Reduce concurrency and increase delays
   ```bash
   PA11Y_MAX_CONCURRENT=1 PA11Y_REQUEST_DELAY=5000 node audit.js yoursite.com
   ```

3. **For problematic sites**: Maximum reliability settings
   ```bash
   PA11Y_MAX_CONCURRENT=1 PA11Y_MAX_RETRIES=5 PA11Y_PAGE_TIMEOUT=120000 PA11Y_REQUEST_DELAY=5000 node audit.js yoursite.com
   ```

## Example Report

The generated report provides:
- Visual summary with color-coded statistics
- Clean, responsive design
- Detailed issue descriptions with WCAG references
- Easy navigation through results

## License

This tool is provided as-is for accessibility testing purposes.
