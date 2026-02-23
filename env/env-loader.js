#!/usr/bin/env node

/**
 * Environment Loader Script
 *
 * Reads a centralized environment file and generates app-specific .env files
 * for all apps in the monorepo.
 *
 * Usage:
 *   node env/env-loader.js dev    # Load development environment
 *   node env/env-loader.js prod   # Load production environment
 *
 * Or via npm scripts:
 *   npm run env:dev
 *   npm run env:prod
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const ENV_DIR = __dirname;

const APPS = {
  root: {
    path: ENV_DIR,
    filename: '.env.local',
    prefix: 'VITE_',
    // Map generic vars to Vite-prefixed vars
    mapping: {
      'FIREBASE_API_KEY': 'VITE_FIREBASE_API_KEY',
      'FIREBASE_AUTH_DOMAIN': 'VITE_FIREBASE_AUTH_DOMAIN',
      'FIREBASE_DATABASE_URL': 'VITE_FIREBASE_DATABASE_URL',
      'FIREBASE_PROJECT_ID': 'VITE_FIREBASE_PROJECT_ID',
      'FIREBASE_STORAGE_BUCKET': 'VITE_FIREBASE_STORAGE_BUCKET',
      'FIREBASE_MESSAGING_SENDER_ID': 'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'FIREBASE_APP_ID': 'VITE_FIREBASE_APP_ID',
      'FIREBASE_MEASUREMENT_ID': 'VITE_FIREBASE_MEASUREMENT_ID',
      'FIREBASE_VAPID_KEY': 'VITE_FIREBASE_VAPID_KEY',
      'SENTRY_DSN': 'VITE_SENTRY_DSN',
      'ENVIRONMENT': 'VITE_ENVIRONMENT',
      'APP_VERSION': 'VITE_APP_VERSION',
      'APP_AGREE_ENDPOINT': 'VITE_APP_AGREE_ENDPOINT',
      'FIND_SIMILAR_STATEMENTS_ENDPOINT': 'VITE_APP_FIND_SIMILAR_STATEMENTS_ENDPOINT',
      'VITE_SIGN_APP_URL': 'VITE_SIGN_APP_URL',
    },
    // Additional static content to append
    extra: `
# Multi-environment keys for service worker (same as main config)
VITE_FIREBASE_API_KEY_DEV=\${VITE_FIREBASE_API_KEY}
VITE_FIREBASE_AUTH_DOMAIN_DEV=\${VITE_FIREBASE_AUTH_DOMAIN}
VITE_FIREBASE_DATABASE_URL_DEV=\${VITE_FIREBASE_DATABASE_URL}
VITE_FIREBASE_PROJECT_ID_DEV=\${VITE_FIREBASE_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET_DEV=\${VITE_FIREBASE_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID_DEV=\${VITE_FIREBASE_MESSAGING_SENDER_ID}
VITE_FIREBASE_APP_ID_DEV=\${VITE_FIREBASE_APP_ID}
VITE_FIREBASE_MEASUREMENT_ID_DEV=\${VITE_FIREBASE_MEASUREMENT_ID}
`.trim()
  },
  massConsensus: {
    path: path.join(ROOT_DIR, 'apps', 'mass-consensus'),
    filename: '.env',
    // Map generic vars to Next.js vars (using array for multiple outputs from same source)
    mappings: [
      // Server-side vars (no prefix)
      ['FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
      ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_EMAIL'],
      ['FIREBASE_PRIVATE_KEY', 'FIREBASE_PRIVATE_KEY'],
      ['USE_FIREBASE_EMULATOR', 'USE_FIREBASE_EMULATOR'],
      ['FIRESTORE_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'],
      ['FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'],
      ['GEMINI_API_KEY', 'GEMINI_API_KEY'],
      ['FIND_SIMILAR_STATEMENTS_ENDPOINT', 'FIND_SIMILAR_STATEMENTS_ENDPOINT'],
      ['FIND_SIMILAR_STATEMENTS_ENDPOINT', 'CHECK_SIMILARITIES_ENDPOINT'],
      // Client-side vars (NEXT_PUBLIC_ prefix)
      ['FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY'],
      ['FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
      ['FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
      ['FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
      ['FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
      ['FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'],
      ['FIREBASE_MEASUREMENT_ID', 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'],
      ['MASS_CONSENSUS_URL', 'NEXT_PUBLIC_APP_URL'],
    ],
    extra: ''
  },
  functions: {
    path: path.join(ROOT_DIR, 'functions'),
    filename: '.env',
    // Cloud functions vars
    mapping: {
      'GEMINI_API_KEY': 'GOOGLE_API_KEY',
      'OPENAI_API_KEY': 'OPENAI_API_KEY',
      'ENVIRONMENT': 'ENVIRONMENT',
      'AI_MODEL_NAME': 'AI_MODEL_NAME',
      'EMAIL_USER': 'EMAIL_USER',
      'EMAIL_PASSWORD': 'EMAIL_PASSWORD',
      'EMAIL_SERVICE': 'EMAIL_SERVICE',
    },
    extra: ''
  },
  sign: {
    path: path.join(ROOT_DIR, 'apps', 'sign'),
    filename: '.env.local',
    // Map generic vars to Next.js vars
    mappings: [
      // Server-side vars (no prefix) - for Firebase Admin SDK
      ['FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
      ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_EMAIL'],
      ['FIREBASE_PRIVATE_KEY', 'FIREBASE_PRIVATE_KEY'],
      ['FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'],
      ['USE_FIREBASE_EMULATOR', 'USE_FIREBASE_EMULATOR'],
      ['FIRESTORE_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'],
      ['FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'],
      // Google Docs API credentials (for importing from Google Docs)
      ['GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL'],
      ['GOOGLE_DOCS_PRIVATE_KEY', 'GOOGLE_DOCS_PRIVATE_KEY'],
      // AI Configuration (for document versioning)
      ['GEMINI_API_KEY', 'GEMINI_API_KEY'],
      ['AI_PROVIDER', 'AI_PROVIDER'],
      // Client-side vars (NEXT_PUBLIC_ prefix)
      ['FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY'],
      ['FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
      ['FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
      ['FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
      ['FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
      ['FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'],
      ['FIREBASE_MEASUREMENT_ID', 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'],
      // Sentry (error monitoring) - SIGN_SENTRY_* takes priority over generic SENTRY_*
      ['SIGN_SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'],
      ['SIGN_SENTRY_DSN', 'SENTRY_DSN'],
      ['SIGN_SENTRY_ORG', 'SENTRY_ORG'],
      ['SIGN_SENTRY_PROJECT', 'SENTRY_PROJECT'],
      ['SIGN_SENTRY_AUTH_TOKEN', 'SENTRY_AUTH_TOKEN'],
      // App URLs (for cross-app navigation)
      ['VITE_SIGN_APP_URL', 'NEXT_PUBLIC_APP_URL'],
      ['APP_URL', 'NEXT_PUBLIC_MAIN_APP_URL'],
    ],
    extra: ''
  }
};

function generateFirebaseConfigFile(sourceVars, envName) {
  const firebaseConfig = {
    apiKey: sourceVars.FIREBASE_API_KEY || '',
    authDomain: sourceVars.FIREBASE_AUTH_DOMAIN || '',
    databaseURL: sourceVars.FIREBASE_DATABASE_URL || '',
    projectId: sourceVars.FIREBASE_PROJECT_ID || '',
    storageBucket: sourceVars.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: sourceVars.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: sourceVars.FIREBASE_APP_ID || '',
    measurementId: sourceVars.FIREBASE_MEASUREMENT_ID || '',
  };

  const outputPath = path.join(ROOT_DIR, 'public', 'firebase-config.json');
  const content = `${JSON.stringify(firebaseConfig, null, 2)}\n`;

  fs.writeFileSync(outputPath, content);
  console.info(`  Generated: ${outputPath} (${envName})`);
}

/**
 * Parse a .env file into key-value pairs
 */
function parseEnvFile(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: Environment file not found: ${filepath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const vars = {};

  content.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') return;

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      vars[key] = value;
    }
  });

  return vars;
}

/**
 * Generate an app-specific .env file
 */
function generateEnvFile(appConfig, sourceVars, envName) {
  const outputPath = path.join(appConfig.path, appConfig.filename);
  const lines = [
    `# ============================================================================`,
    `# AUTO-GENERATED - DO NOT EDIT DIRECTLY`,
    `# ============================================================================`,
    `# Generated by: npm run env:${envName}`,
    `# Source: env/.env.${envName}`,
    `# ============================================================================`,
    ``
  ];

  // Process mappings (support both object and array formats)
  if (appConfig.mappings) {
    // Array format: [[sourceKey, targetKey], ...]
    for (const [sourceKey, targetKey] of appConfig.mappings) {
      if (sourceVars[sourceKey] !== undefined) {
        lines.push(`${targetKey}=${sourceVars[sourceKey]}`);
      }
    }
  } else if (appConfig.mapping) {
    // Object format: { sourceKey: targetKey, ... }
    for (const [sourceKey, targetKey] of Object.entries(appConfig.mapping)) {
      if (sourceVars[sourceKey] !== undefined) {
        lines.push(`${targetKey}=${sourceVars[sourceKey]}`);
      }
    }
  }

  // Add extra content if any
  if (appConfig.extra) {
    lines.push('');
    // Replace ${VAR} placeholders with actual values
    let extra = appConfig.extra;
    for (const [key, value] of Object.entries(sourceVars)) {
      const targetKey = appConfig.mapping?.[key];
      if (targetKey) {
        extra = extra.replace(new RegExp(`\\$\\{${targetKey}\\}`, 'g'), value);
      }
    }
    lines.push(extra);
  }

  // Only write file if content has changed (prevents Vite restart loops)
  const newContent = lines.join('\n') + '\n';
  const existingContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';

  if (newContent !== existingContent) {
    fs.writeFileSync(outputPath, newContent);
    console.info(`  Generated: ${outputPath}`);
  } else {
    console.info(`  Unchanged: ${outputPath}`);
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.info('Usage: node env/env-loader.js <environment>');
    console.info('');
    console.info('Available environments:');
    console.info('  dev   - Development (freedi-test, with emulator)');
    console.info('  test  - Testing (freedi-test)');
    console.info('  prod  - Production (wizcol-app)');
    console.info('');
    console.info('Or use npm scripts:');
    console.info('  npm run env:dev');
    console.info('  npm run env:test');
    console.info('  npm run env:prod');
    process.exit(0);
  }

  const envName = args[0];
  const envFile = path.join(ENV_DIR, `.env.${envName}`);

  console.info(`\nLoading environment: ${envName}`);
  console.info(`Source file: ${envFile}\n`);

  // Parse source environment file
  const sourceVars = parseEnvFile(envFile);

  // Generate app-specific files
  console.info('Generating app-specific environment files:');

  for (const [appName, appConfig] of Object.entries(APPS)) {
    // Check if app directory exists
    if (!fs.existsSync(appConfig.path)) {
      console.info(`  Skipped: ${appName} (directory not found)`);
      continue;
    }

    generateEnvFile(appConfig, sourceVars, envName);
  }

  generateFirebaseConfigFile(sourceVars, envName);

  console.info(`\nEnvironment '${envName}' loaded successfully!`);
  console.info(`Firebase Project: ${sourceVars.FIREBASE_PROJECT_ID}`);
  console.info(`Emulator: ${sourceVars.USE_FIREBASE_EMULATOR === 'true' ? 'enabled' : 'disabled'}`);
  console.info('');
}

main();
