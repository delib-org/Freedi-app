#!/usr/bin/env node

/**
 * Deploy specific Cloud Functions (or all) to a target environment.
 *
 * Usage:
 *   node scripts/deploy-functions.js <target> [funcA funcB ...]
 *   node scripts/deploy-functions.js <target> [funcA,funcB]
 *
 * Via npm (note the `--` separator — npm swallows flags otherwise):
 *   npm run deploy:f:prod -- sendNotification scheduleDigest
 *   npm run deploy:f:test -- sendNotification,scheduleDigest
 *   npm run deploy:f:prod                 # deploys ALL functions
 *
 * Targets: prod | test | dev
 *
 * Flow:
 *   1. Load env for target
 *   2. Build functions
 *   3. firebase use <project>
 *   4. firebase deploy --only functions[:name1,functions:name2,...]
 *   5. Restore dev env (for prod/test only)
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const TARGETS = {
	prod: { envFile: 'prod', firebaseProject: 'wizcol', restoreDev: true },
	test: { envFile: 'test', firebaseProject: 'test', restoreDev: true },
	dev: { envFile: 'dev', firebaseProject: 'dev', restoreDev: false },
};

function run(command, options = {}) {
	console.info(`\n> ${command}\n`);
	execSync(command, {
		cwd: options.cwd || ROOT_DIR,
		stdio: 'inherit',
		env: { ...process.env, ...options.env },
	});
}

function parseFunctionNames(args) {
	return args
		.flatMap((arg) => arg.split(','))
		.map((name) => name.trim().replace(/^--/, ''))
		.filter(Boolean);
}

function printUsage() {
	console.info(`
Deploy Functions Script
=======================

Usage: npm run deploy:f:<target> -- [funcName1 funcName2 ...]

Targets: prod | test | dev

Examples:
  npm run deploy:f:prod                              # Deploy ALL functions to prod
  npm run deploy:f:prod -- sendNotification          # Deploy one function
  npm run deploy:f:prod -- fn1 fn2 fn3               # Deploy multiple (space-separated)
  npm run deploy:f:test -- fn1,fn2                   # Deploy multiple (comma-separated)

Note: The \`--\` separator is REQUIRED so npm forwards the function names.
`);
}

function main() {
	process.chdir(ROOT_DIR);
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const targetName = args[0];
	const target = TARGETS[targetName];
	if (!target) {
		console.error(`Unknown target: ${targetName}`);
		console.error(`Available targets: ${Object.keys(TARGETS).join(', ')}`);
		process.exit(1);
	}

	const functionNames = parseFunctionNames(args.slice(1));
	const deployOnly =
		functionNames.length > 0
			? functionNames.map((name) => `functions:${name}`).join(',')
			: 'functions';

	console.info('='.repeat(60));
	console.info(`DEPLOYING FUNCTIONS TO: ${targetName.toUpperCase()}`);
	console.info(`Firebase project: ${target.firebaseProject}`);
	console.info(
		functionNames.length > 0
			? `Functions: ${functionNames.join(', ')}`
			: 'Functions: ALL'
	);
	console.info('='.repeat(60));

	console.info('\n📦 Loading environment...');
	run(`node env/env-loader.js ${target.envFile}`);

	console.info('\n⚡ Building functions...');
	run('npm run build', { cwd: path.join(ROOT_DIR, 'functions') });

	console.info('\n🔥 Selecting Firebase project...');
	run(`firebase use ${target.firebaseProject}`);

	console.info('\n🚀 Deploying...');
	try {
		run(`firebase deploy --only ${deployOnly}`);
	} finally {
		if (target.restoreDev) {
			console.info('\n♻️  Restoring dev environment...');
			try {
				run('node env/env-loader.js dev');
			} catch (err) {
				console.error('Failed to restore dev env:', err.message);
			}
		}
	}

	console.info('\n' + '='.repeat(60));
	console.info(`✅ DEPLOY TO ${targetName.toUpperCase()} COMPLETE`);
	console.info('='.repeat(60) + '\n');
}

main();
