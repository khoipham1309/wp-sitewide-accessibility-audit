#!/usr/bin/env node

/**
 * Quick start guide for the WordPress Accessibility Audit Tool
 */

const chalk = require('chalk');

console.log(chalk.cyan('\n📋 WordPress Accessibility Audit Tool - Quick Start\n'));

console.log(chalk.yellow('To audit any WordPress website, simply provide the URL:\n'));

console.log(chalk.white('Basic usage:'));
console.log(chalk.gray('  node audit.js example.com'));
console.log(chalk.gray('  node audit.js https://example.com\n'));

console.log(chalk.white('Run and open report:'));
console.log(chalk.gray('  node audit-and-open.js example.com\n'));

console.log(chalk.white('Maximum reliability mode (slower but more stable):'));
console.log(chalk.gray('  node run-reliable-audit.js example.com\n'));

console.log(chalk.white('With custom settings:'));
console.log(chalk.gray('  PA11Y_MAX_CONCURRENT=5 PA11Y_PAGE_TIMEOUT=90000 node audit.js example.com\n'));

console.log(chalk.green('The tool will automatically:'));
console.log(chalk.gray('  ✓ Add https:// if not provided'));
console.log(chalk.gray('  ✓ Find the sitemap at /sitemap_index.xml'));
console.log(chalk.gray('  ✓ Scan all pages in the sitemap'));
console.log(chalk.gray('  ✓ Generate an HTML report (report.html)\n'));

console.log(chalk.yellow('Common WordPress sitemap locations:'));
console.log(chalk.gray('  • /sitemap_index.xml (default)'));
console.log(chalk.gray('  • /sitemap.xml'));
console.log(chalk.gray('  • /wp-sitemap.xml (WordPress 5.5+)'));
console.log(chalk.gray('  • /sitemap_index.xml (Yoast SEO)\n'));

console.log(chalk.white('If the sitemap is in a non-standard location:'));
console.log(chalk.gray('  node audit.js https://example.com/custom-sitemap.xml\n'));

console.log(chalk.cyan('Ready to start? Try running:'));
console.log(chalk.white.bold('  node audit.js ' + (process.argv[2] || 'yourwordpresssite.com')) + '\n');
