/**
 * Example of how to use the audit script programmatically
 * This can be useful for CI/CD pipelines or automated testing
 */

const { exec } = require('child_process');
const path = require('path');
const chalk = require('chalk');

// Get website URL from command line arguments
const websiteUrl = process.argv[2];

if (!websiteUrl) {
  console.error(chalk.red('\nError: Please provide a WordPress website URL'));
  console.log(chalk.yellow('\nUsage:'));
  console.log(chalk.gray('  node example-usage.js yourwordpresssite.com'));
  console.log(chalk.gray('  node example-usage.js https://yourwordpresssite.com'));
  process.exit(1);
}

const scriptPath = path.join(__dirname, 'audit.js');

console.log('Starting accessibility audit...');
console.log(`Target website: ${websiteUrl}`);

// Run the audit
const auditProcess = exec(`node "${scriptPath}" "${websiteUrl}"`, (error, stdout, stderr) => {
  if (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
  
  if (stderr) {
    console.error('Audit stderr:', stderr);
  }
  
  console.log(stdout);
  console.log('\nAudit completed successfully!');
  console.log('Report saved to: report.html');
});

// Stream output in real-time
auditProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

auditProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});
