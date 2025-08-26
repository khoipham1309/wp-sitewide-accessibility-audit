/**
 * Run audit and automatically open the report in the default browser
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

// Get website URL from command line
const websiteUrl = process.argv[2];

if (!websiteUrl) {
  console.error(chalk.red('\nError: Please provide a WordPress website URL'));
  console.log(chalk.yellow('\nUsage:'));
  console.log(chalk.gray('  node audit-and-open.js yourwordpresssite.com'));
  console.log(chalk.gray('  node audit-and-open.js https://yourwordpresssite.com'));
  process.exit(1);
}

const scriptPath = path.join(__dirname, 'audit.js');
const reportPath = path.join(__dirname, 'report.html');

console.log(chalk.cyan('\n🔍 Starting accessibility audit...\n'));
console.log(chalk.gray(`Target website: ${websiteUrl}\n`));

// Run the audit
exec(`node "${scriptPath}" "${websiteUrl}"`, (error, stdout, stderr) => {
  if (error) {
    console.error(chalk.red('Audit failed:'), error);
    process.exit(1);
  }
  
  console.log(stdout);
  
  // Check if report was generated
  if (fs.existsSync(reportPath)) {
    console.log(chalk.cyan('\n🌐 Opening report in browser...'));
    
    // Open report in default browser (cross-platform)
    const openCommand = process.platform === 'win32' 
      ? `start "" "${reportPath}"`
      : process.platform === 'darwin' 
        ? `open "${reportPath}"`
        : `xdg-open "${reportPath}"`;
    
    exec(openCommand, (err) => {
      if (err) {
        console.error(chalk.yellow('Could not open report automatically:'), err.message);
        console.log(chalk.gray(`Please open manually: ${reportPath}`));
      } else {
        console.log(chalk.green('✓ Report opened in browser'));
      }
    });
  } else {
    console.error(chalk.red('Report file was not generated'));
    console.error(chalk.yellow('Check the output above for errors'));
  }
});