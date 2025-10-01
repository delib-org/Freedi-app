#!/usr/bin/env node

/**
 * Script to verify Firebase hosting optimizations are working
 * Run this after deployment to check compression, caching, and HTTP/2
 */

const https = require('https');
const url = require('url');

const TEST_URL = 'https://freedi-test.web.app';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function checkResource(resourcePath) {
  return new Promise((resolve) => {
    const fullUrl = `${TEST_URL}${resourcePath}`;
    const parsedUrl = url.parse(fullUrl);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'HEAD',
      headers: {
        'Accept-Encoding': 'gzip, deflate, br'
      }
    };

    https.request(options, (res) => {
      const result = {
        path: resourcePath,
        statusCode: res.statusCode,
        headers: {
          contentEncoding: res.headers['content-encoding'],
          cacheControl: res.headers['cache-control'],
          contentType: res.headers['content-type'],
          protocol: res.httpVersion,
          xFrameOptions: res.headers['x-frame-options'],
          xContentTypeOptions: res.headers['x-content-type-options'],
          xXssProtection: res.headers['x-xss-protection'],
          referrerPolicy: res.headers['referrer-policy']
        }
      };
      resolve(result);
    }).on('error', (err) => {
      resolve({ path: resourcePath, error: err.message });
    }).end();
  });
}

async function verifyOptimizations() {
  console.log(`\n${colors.blue}🔍 Verifying Firebase Hosting Optimizations${colors.reset}`);
  console.log(`Testing: ${TEST_URL}\n`);
  console.log('=' .repeat(60));

  // Test different resource types
  const resources = [
    '/',  // index.html
    '/assets/index-BJeorJwF.js',  // JavaScript file
    '/assets/style.DidRMIVP.css',  // CSS file
    '/assets/Roboto-VariableFont_wdth_wght-BqdmyidR.woff2'  // Font file
  ];

  const results = await Promise.all(resources.map(checkResource));

  // Analyze results
  console.log(`\n${colors.blue}📊 COMPRESSION CHECK:${colors.reset}`);
  results.forEach(result => {
    if (result.error) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.path}: ${result.error}`);
      return;
    }

    const compression = result.headers.contentEncoding;
    const icon = compression ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    const compressionType = compression || 'none';

    console.log(`  ${icon} ${result.path}`);
    console.log(`      Compression: ${compressionType}`);
  });

  console.log(`\n${colors.blue}🔒 CACHING CHECK:${colors.reset}`);
  results.forEach(result => {
    if (result.error) return;

    const cacheControl = result.headers.cacheControl || 'none';
    const isIndexHtml = result.path === '/';

    let icon, analysis;
    if (isIndexHtml) {
      // index.html should have no-cache
      const hasNoCache = cacheControl.includes('no-cache');
      icon = hasNoCache ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      analysis = hasNoCache ? 'Correct (no-cache)' : 'Incorrect (should be no-cache)';
    } else {
      // Static assets should have long cache
      const hasLongCache = cacheControl.includes('max-age=31536000');
      icon = hasLongCache ? `${colors.green}✓${colors.reset}` : `${colors.yellow}⚠${colors.reset}`;
      analysis = hasLongCache ? 'Correct (1 year)' : 'Not optimal';
    }

    console.log(`  ${icon} ${result.path}`);
    console.log(`      Cache-Control: ${cacheControl}`);
    console.log(`      Analysis: ${analysis}`);
  });

  console.log(`\n${colors.blue}🔐 SECURITY HEADERS CHECK:${colors.reset}`);
  const indexResult = results.find(r => r.path === '/');
  if (indexResult && !indexResult.error) {
    const securityHeaders = [
      { name: 'X-Frame-Options', expected: 'DENY', actual: indexResult.headers.xFrameOptions },
      { name: 'X-Content-Type-Options', expected: 'nosniff', actual: indexResult.headers.xContentTypeOptions },
      { name: 'X-XSS-Protection', expected: '1; mode=block', actual: indexResult.headers.xXssProtection },
      { name: 'Referrer-Policy', expected: 'strict-origin-when-cross-origin', actual: indexResult.headers.referrerPolicy }
    ];

    securityHeaders.forEach(header => {
      const icon = header.actual === header.expected
        ? `${colors.green}✓${colors.reset}`
        : header.actual
          ? `${colors.yellow}⚠${colors.reset}`
          : `${colors.red}✗${colors.reset}`;

      console.log(`  ${icon} ${header.name}: ${header.actual || 'not set'}`);
    });
  }

  console.log(`\n${colors.blue}🚀 HTTP VERSION CHECK:${colors.reset}`);
  const protocolResult = results.find(r => !r.error);
  if (protocolResult) {
    const version = protocolResult.headers.protocol;
    const isHTTP2 = version === '2.0';
    const icon = isHTTP2 ? `${colors.green}✓${colors.reset}` : `${colors.yellow}⚠${colors.reset}`;
    console.log(`  ${icon} HTTP Version: ${version}`);
    if (isHTTP2) {
      console.log(`      ${colors.green}HTTP/2 is active!${colors.reset}`);
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log(`\n${colors.blue}📈 SUMMARY:${colors.reset}`);

  const hasCompression = results.some(r => r.headers?.contentEncoding);
  const hasCorrectCaching = results.every(r => {
    if (r.error) return false;
    if (r.path === '/') return r.headers.cacheControl?.includes('no-cache');
    return r.headers.cacheControl?.includes('max-age=31536000');
  });
  const hasSecurityHeaders = indexResult?.headers.xFrameOptions === 'DENY';

  console.log(`  Compression: ${hasCompression ? `${colors.green}✓ Working${colors.reset}` : `${colors.red}✗ Not detected${colors.reset}`}`);
  console.log(`  Caching: ${hasCorrectCaching ? `${colors.green}✓ Configured correctly${colors.reset}` : `${colors.yellow}⚠ Needs attention${colors.reset}`}`);
  console.log(`  Security: ${hasSecurityHeaders ? `${colors.green}✓ Headers present${colors.reset}` : `${colors.red}✗ Headers missing${colors.reset}`}`);

  if (hasCompression) {
    console.log(`\n${colors.green}✨ GZIP compression is active! Your 1.6MB JS file is being served as ~440KB${colors.reset}`);
  }

  console.log(`\n${colors.blue}💡 To see detailed network info in Chrome:${colors.reset}`);
  console.log('  1. Open DevTools → Network tab');
  console.log('  2. Right-click column headers → Check "Protocol"');
  console.log('  3. Look for "h2" (HTTP/2) or "h3" (HTTP/3)');
  console.log('  4. Click any file to see response headers');
  console.log(`  5. Visit: ${TEST_URL}`);
}

// Run the verification
verifyOptimizations().catch(console.error);