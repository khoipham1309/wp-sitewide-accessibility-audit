#!/usr/bin/env node

/**
 * Example script showing how to run the audit with custom configuration
 * for maximum reliability
 */

const { spawn } = require('child_process');
const chalk = require('chalk');

// Get website URL from command line
const websiteUrl = process.argv[2];

if (!websiteUrl) {
  console.error(chalk.red('\nError: Please provide a WordPress website URL'));
  console.log(chalk.yellow('\nUsage:'));
  console.log(chalk.gray('  node run-reliable-audit.js yourwordpresssite.com'));
  console.log(chalk.gray('  node run-reliable-audit.js https://yourwordpresssite.com'));
  console.log(chalk.gray('  node run-reliable-audit.js https://yourwordpresssite.com --open'));
  process.exit(1);
}

console.log(chalk.cyan('\n🚀 Running Enhanced Reliability Audit\n'));
console.log(chalk.gray('Configuration:'));
console.log(chalk.gray('- Max concurrent checks: 1 (for reliability)'));
console.log(chalk.gray('- Page timeout: 90 seconds'));
console.log(chalk.gray('- Max retries: 5'));
console.log(chalk.gray('- Request delay: 3 seconds'));
console.log(chalk.gray('- Batch size: 3\n'));

// Set environment variables for maximum reliability
const env = {
  ...process.env,
  PA11Y_MAX_CONCURRENT: '1',      // Single check at a time for maximum reliability
  PA11Y_BATCH_SIZE: '3',          // Small batches
  PA11Y_REQUEST_DELAY: '3000',    // 3 seconds between requests
  PA11Y_PAGE_TIMEOUT: '90000',    // 90 second timeout
  PA11Y_PAGE_WAIT: '3000',        // 3 seconds wait after page load
  PA11Y_MAX_RETRIES: '5',         // Try up to 5 times
  PA11Y_RETRY_DELAY: '10000',     // 10 second initial retry delay
};

// Run the audit script
const audit = spawn('node', ['audit.js', websiteUrl], {
  env,
  stdio: 'inherit',
  shell: true
});

audit.on('close', (code) => {
  if (code === 0) {
    console.log(chalk.green('\n✓ Audit completed successfully!'));
    
    // Optionally open the report
    if (process.argv[3] === '--open') {
      const open = require('open');
      open('report.html');
    }
  } else {
    console.error(chalk.red(`\n✗ Audit failed with code ${code}`));
    process.exit(code);
  }
});

audit.on('error', (error) => {
  console.error(chalk.red('\n✗ Failed to start audit:'), error);
  process.exit(1);
});
