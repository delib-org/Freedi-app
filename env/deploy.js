#!/usr/bin/env node

/**
 * Unified Deploy Script
 *
 * Handles environment setup and deployment to any Firebase project.
 *
 * Usage:
 *   node env/deploy.js <target> [options]
 *
 * Targets:
 *   test         - Deploy to freedi-test (testing)
 *   prod         - Deploy to synthesistalyaron (production)
 *   wizcol       - Deploy to wizcol (if configured)
 *
 * Options:
 *   --hosting    - Deploy only hosting
 *   --functions  - Deploy only functions
 *   --rules      - Deploy only Firestore/Storage rules
 *   --all        - Deploy everything (default)
 *   --skip-build - Skip the build step
 *
 * Examples:
 *   npm run deploy test              # Full deploy to test
 *   npm run deploy prod --hosting    # Only hosting to production
 *   npm run deploy wizcol --functions # Only functions to wizcol
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// Deploy target configurations
const TARGETS = {
  dev: {
    envFile: 'dev',           // Use .env.dev (freedi-test with emulator)
    firebaseProject: 'dev',
    hostingTarget: 'dev',
    description: 'Local development (freedi-test)',
  },
  test: {
    envFile: 'test',          // Use .env.test (freedi-test deployed)
    firebaseProject: 'test',
    hostingTarget: 'test',
    description: 'Testing new features before production (freedi-test)',
  },
  prod: {
    envFile: 'prod',          // Use .env.prod (synthesistalyaron)
    firebaseProject: 'prod',
    hostingTarget: 'prod',
    description: 'Current production (synthesistalyaron)',
  },
  wizcol: {
    envFile: 'wizcol',        // Use .env.wizcol (wizcol-app)
    firebaseProject: 'wizcol',
    hostingTarget: 'wizcol',
    description: 'Main production - Wizcol (wizcol-app)',
  },
};

/**
 * Run a command and stream output
 */
function run(command, options = {}) {
  console.info(`\n> ${command}\n`);
  try {
    execSync(command, {
      cwd: options.cwd || ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env, ...options.env },
    });
    return true;
  } catch (error) {
    if (!options.ignoreError) {
      console.error(`Command failed: ${command}`);
      process.exit(1);
    }
    return false;
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.info(`
Unified Deploy Script
=====================

Usage: npm run deploy <target> [options]

Targets:
  dev        Local development (freedi-test)
  test       Testing new features before production (freedi-test)
  prod       Current production (synthesistalyaron)
  wizcol     Main production (wizcol-app)

Options:
  --hosting     Deploy only hosting
  --functions   Deploy only functions
  --rules       Deploy only Firestore/Storage rules
  --all         Deploy everything (default)
  --skip-build  Skip the build step
  --dry-run     Show what would be deployed without deploying

Examples:
  npm run deploy test              # Test new features
  npm run deploy prod --hosting    # Only hosting to current production
  npm run deploy wizcol            # Full deploy to main production
`);
}

/**
 * Main deploy function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  const targetName = args[0];
  const options = {
    hosting: args.includes('--hosting'),
    functions: args.includes('--functions'),
    rules: args.includes('--rules'),
    skipBuild: args.includes('--skip-build'),
    dryRun: args.includes('--dry-run'),
  };

  // If no specific option, deploy all
  if (!options.hosting && !options.functions && !options.rules) {
    options.hosting = true;
    options.functions = true;
    options.rules = true;
  }

  // Validate target
  const target = TARGETS[targetName];
  if (!target) {
    console.error(`Unknown target: ${targetName}`);
    console.error(`Available targets: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  console.info('='.repeat(60));
  console.info(`DEPLOYING TO: ${targetName.toUpperCase()}`);
  console.info(`Description: ${target.description}`);
  console.info(`Firebase Project: ${target.firebaseProject}`);
  console.info('='.repeat(60));

  if (options.dryRun) {
    console.info('\n[DRY RUN] Would execute the following steps:\n');
  }

  // Step 1: Load environment
  console.info('\n📦 Step 1: Loading environment configuration...');
  if (!options.dryRun) {
    run(`node env/env-loader.js ${target.envFile}`);
  } else {
    console.info(`  > node env/env-loader.js ${target.envFile}`);
  }

  // Step 2: Select Firebase project
  console.info('\n🔥 Step 2: Selecting Firebase project...');
  if (!options.dryRun) {
    run(`firebase use ${target.firebaseProject}`);
  } else {
    console.info(`  > firebase use ${target.firebaseProject}`);
  }

  // Step 3: Build (if not skipped)
  if (!options.skipBuild && options.hosting) {
    console.info('\n🔨 Step 3: Building application...');
    if (!options.dryRun) {
      run('npm run build');
    } else {
      console.info('  > npm run build');
    }
  }

  // Step 4: Build functions (if deploying functions)
  if (options.functions) {
    console.info('\n⚡ Step 4: Building Cloud Functions...');
    if (!options.dryRun) {
      run('npm run build', { cwd: path.join(ROOT_DIR, 'functions') });
    } else {
      console.info('  > cd functions && npm run build');
    }
  }

  // Step 5: Deploy
  console.info('\n🚀 Step 5: Deploying to Firebase...');

  const deployParts = [];
  if (options.hosting) deployParts.push(`hosting:${target.hostingTarget}`);
  if (options.functions) deployParts.push('functions');
  if (options.rules) deployParts.push('firestore:rules', 'storage');

  const deployCommand = `firebase deploy --only ${deployParts.join(',')}`;

  if (!options.dryRun) {
    run(deployCommand);
  } else {
    console.info(`  > ${deployCommand}`);
  }

  // Done
  console.info('\n' + '='.repeat(60));
  console.info(`✅ DEPLOYMENT TO ${targetName.toUpperCase()} COMPLETE!`);
  console.info('='.repeat(60) + '\n');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
