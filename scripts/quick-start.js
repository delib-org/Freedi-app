#!/usr/bin/env node

/**
 * Freedi Quick Start Wizard
 *
 * This wizard provides two paths for getting started:
 * 1. Quick Start - Uses Firebase emulators (no account needed)
 * 2. Full Setup - Connect to your own Firebase project
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	bgBlue: '\x1b[44m',
	bgGreen: '\x1b[42m',
};

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function question(query) {
	return new Promise((resolve) => rl.question(query, resolve));
}

function log(message, color = 'reset') {
	console.info(colors[color] + message + colors.reset);
}

function logBox(lines, color = 'cyan') {
	const maxLength = Math.max(...lines.map((l) => l.length));
	const border = '─'.repeat(maxLength + 2);

	console.info(colors[color] + '┌' + border + '┐' + colors.reset);
	lines.forEach((line) => {
		const padding = ' '.repeat(maxLength - line.length);
		console.info(
			colors[color] + '│ ' + colors.reset + line + padding + colors[color] + ' │' + colors.reset
		);
	});
	console.info(colors[color] + '└' + border + '┘' + colors.reset);
}

function checkCommand(command) {
	try {
		execSync(`which ${command}`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function checkDocker() {
	try {
		execSync('docker --version', { stdio: 'ignore' });
		execSync('docker compose version', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function checkNodeVersion() {
	try {
		const version = execSync('node --version', { encoding: 'utf8' }).trim();
		const major = parseInt(version.slice(1).split('.')[0]);
		return { version, isValid: major >= 18 };
	} catch {
		return { version: null, isValid: false };
	}
}

function checkJava() {
	try {
		execSync('java -version 2>&1', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function fileExists(filePath) {
	return fs.existsSync(path.join(process.cwd(), filePath));
}

function copyFile(src, dest) {
	const srcPath = path.join(process.cwd(), src);
	const destPath = path.join(process.cwd(), dest);

	// Create directory if it doesn't exist
	const destDir = path.dirname(destPath);
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	fs.copyFileSync(srcPath, destPath);
}

async function showWelcome() {
	console.clear();
	console.info('\n');
	logBox(
		[
			'',
			'  Welcome to Freedi!  ',
			'',
			'  An open-source deliberation platform  ',
			'  for communities and organizations  ',
			'',
		],
		'cyan'
	);
	console.info('\n');
}

async function showOptions() {
	log('Choose your setup path:\n', 'bright');

	log('  [1] Quick Start (Recommended for trying out)', 'green');
	log('      Uses Firebase emulators - no account needed', 'dim');
	log('      Ready in ~2 minutes\n', 'dim');

	log('  [2] Docker Quick Start', 'blue');
	log('      Consistent environment with Docker Compose', 'dim');
	log('      Includes all dependencies\n', 'dim');

	log('  [3] Full Setup (For contributors/deployment)', 'yellow');
	log('      Connect to your own Firebase project', 'dim');
	log('      Required for production deployment\n', 'dim');

	log('  [4] Verify existing setup', 'magenta');
	log('      Check if everything is configured correctly\n', 'dim');

	const choice = await question('Enter your choice (1-4): ');
	return choice.trim();
}

async function quickStartLocal() {
	log('\n--- Quick Start (Local Emulators) ---\n', 'green');

	// Check prerequisites
	log('Checking prerequisites...', 'cyan');

	const node = checkNodeVersion();
	if (!node.isValid) {
		log(`\n${node.version ? 'Node.js ' + node.version : 'Node.js not found'}`, 'red');
		log('Please install Node.js 18+ from https://nodejs.org/', 'yellow');
		return false;
	}
	log(`  Node.js ${node.version}`, 'green');

	if (!checkJava()) {
		log('\n  Java not found (required for Firebase emulators)', 'yellow');
		log('  Install Java 11+ from https://adoptium.net/', 'yellow');
		log('  Or use Docker Quick Start (option 2) instead\n', 'cyan');

		const proceed = await question('Continue anyway? (y/n): ');
		if (proceed.toLowerCase() !== 'y') {
			return false;
		}
	} else {
		log('  Java installed', 'green');
	}

	if (!checkCommand('firebase')) {
		log('\n  Installing Firebase CLI...', 'yellow');
		try {
			execSync('npm install -g firebase-tools', { stdio: 'inherit' });
			log('  Firebase CLI installed', 'green');
		} catch {
			log('  Failed to install Firebase CLI', 'red');
			log('  Try: npm install -g firebase-tools', 'yellow');
			return false;
		}
	} else {
		log('  Firebase CLI installed', 'green');
	}

	// Create emulator environment file
	log('\nCreating environment configuration...', 'cyan');
	createEmulatorEnvFile();
	log('  Environment files created', 'green');

	// Install dependencies
	log('\nInstalling dependencies (this may take a few minutes)...', 'cyan');
	try {
		execSync('npm install', { stdio: 'inherit' });
		log('  Root dependencies installed', 'green');

		execSync('cd functions && npm install', { stdio: 'inherit', shell: true });
		log('  Functions dependencies installed', 'green');

		// Build shared packages
		if (fileExists('packages/shared-types/package.json')) {
			execSync('cd packages/shared-types && npm install && npm run build', {
				stdio: 'inherit',
				shell: true,
			});
			log('  Shared packages built', 'green');
		}
	} catch (error) {
		log('  Failed to install dependencies', 'red');
		log(`  Error: ${error.message}`, 'dim');
		return false;
	}

	// Success!
	console.info('\n');
	logBox(
		[
			'',
			'  Setup Complete!  ',
			'',
			'  To start the development server:  ',
			'',
			'    npm run dev:emulator  ',
			'',
			'  This will start:  ',
			'    - Web app at http://localhost:5173  ',
			'    - Emulator UI at http://localhost:4000  ',
			'',
		],
		'green'
	);

	return true;
}

async function quickStartDocker() {
	log('\n--- Docker Quick Start ---\n', 'blue');

	// Check Docker
	if (!checkDocker()) {
		log('Docker is not installed or not running.', 'red');
		log('\nPlease install Docker Desktop from:', 'yellow');
		log('  https://www.docker.com/products/docker-desktop\n', 'cyan');
		return false;
	}
	log('  Docker installed', 'green');

	// Create Docker environment file
	log('\nCreating Docker environment configuration...', 'cyan');
	createDockerEnvFile();
	log('  Environment files created', 'green');

	// Start Docker Compose
	log('\nStarting Docker containers (first run may take several minutes)...', 'cyan');
	log('This will download images and install all dependencies.\n', 'dim');

	const proceed = await question('Start Docker containers now? (y/n): ');
	if (proceed.toLowerCase() !== 'y') {
		log('\nTo start later, run:', 'yellow');
		log('  docker compose up\n', 'cyan');
		return true;
	}

	try {
		// Run docker compose up in foreground
		const dockerProcess = spawn('docker', ['compose', 'up', '--build'], {
			stdio: 'inherit',
			cwd: process.cwd(),
		});

		dockerProcess.on('error', (error) => {
			log(`\nDocker error: ${error.message}`, 'red');
		});

		// Don't wait for it to complete - it runs continuously
		log('\nDocker containers starting...', 'green');
		log('Press Ctrl+C to stop\n', 'dim');
	} catch (error) {
		log(`\nFailed to start Docker: ${error.message}`, 'red');
		return false;
	}

	return true;
}

async function fullSetup() {
	log('\n--- Full Setup (Firebase Project) ---\n', 'yellow');
	log('This will run the Firebase setup wizard.', 'dim');
	log('You will need a Firebase account.\n', 'dim');

	const proceed = await question('Continue with full setup? (y/n): ');
	if (proceed.toLowerCase() !== 'y') {
		return false;
	}

	// Run the existing setup script
	try {
		require('./setup-firebase.js');
	} catch {
		// The setup script handles its own execution
		execSync('node scripts/setup-firebase.js', { stdio: 'inherit' });
	}

	return true;
}

async function verifySetup() {
	log('\n--- Verifying Setup ---\n', 'magenta');

	try {
		execSync('node scripts/verify-setup.js', { stdio: 'inherit' });
	} catch {
		// verify-setup.js handles its own exit code
	}

	return true;
}

function createEmulatorEnvFile() {
	const emulatorEnv = `# Freedi Emulator Environment
# This file is auto-generated for local development with Firebase emulators

# Use emulators instead of real Firebase
VITE_USE_FIREBASE_EMULATOR=true

# Emulator hosts
VITE_FIRESTORE_EMULATOR_HOST=localhost:8080
VITE_AUTH_EMULATOR_HOST=localhost:9099
VITE_STORAGE_EMULATOR_HOST=localhost:9199
VITE_FUNCTIONS_EMULATOR_HOST=localhost:5001

# Firebase Configuration (dummy values for emulator)
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://demo-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:demo
VITE_FIREBASE_MEASUREMENT_ID=G-DEMO

# App URLs
VITE_APP_URL=http://localhost:5173
VITE_MASS_CONSENSUS_URL=http://localhost:3001

# Environment
VITE_ENVIRONMENT=development
`;

	// Write to env/.env.dev for the app
	const envDir = path.join(process.cwd(), 'env');
	if (!fs.existsSync(envDir)) {
		fs.mkdirSync(envDir, { recursive: true });
	}

	// Only create if doesn't exist (don't overwrite user config)
	const devEnvPath = path.join(envDir, '.env.dev');
	if (!fs.existsSync(devEnvPath)) {
		fs.writeFileSync(devEnvPath, emulatorEnv);
	}

	// Create .env.development for Vite
	const viteEnvPath = path.join(process.cwd(), '.env.development');
	if (!fs.existsSync(viteEnvPath)) {
		fs.writeFileSync(viteEnvPath, emulatorEnv);
	}

	// Create functions/.env
	const functionsEnv = `# Functions Emulator Configuration
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_SERVICE=gmail
`;

	const functionsEnvPath = path.join(process.cwd(), 'functions', '.env');
	if (!fs.existsSync(functionsEnvPath)) {
		fs.writeFileSync(functionsEnvPath, functionsEnv);
	}
}

function createDockerEnvFile() {
	const dockerEnv = `# Docker Development Environment
# This file is auto-generated for Docker-based development

# Use emulators
VITE_USE_FIREBASE_EMULATOR=true

# Docker-specific hosts (container names)
VITE_FIRESTORE_EMULATOR_HOST=emulators:8080
VITE_AUTH_EMULATOR_HOST=emulators:9099
VITE_STORAGE_EMULATOR_HOST=emulators:9199
VITE_FUNCTIONS_EMULATOR_HOST=emulators:5001

# Firebase Configuration (dummy values for emulator)
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://demo-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:demo

# App URLs
VITE_APP_URL=http://localhost:5173
VITE_MASS_CONSENSUS_URL=http://localhost:3001

# Environment
VITE_ENVIRONMENT=development
`;

	const envDir = path.join(process.cwd(), 'env');
	if (!fs.existsSync(envDir)) {
		fs.mkdirSync(envDir, { recursive: true });
	}

	fs.writeFileSync(path.join(envDir, '.env.docker'), dockerEnv);

	// Also create for mass-consensus app
	const mcDir = path.join(process.cwd(), 'apps', 'mass-consensus');
	if (fs.existsSync(mcDir)) {
		fs.writeFileSync(path.join(mcDir, '.env.docker'), dockerEnv);
	}

	// And sign app
	const signDir = path.join(process.cwd(), 'apps', 'sign');
	if (fs.existsSync(signDir)) {
		fs.writeFileSync(path.join(signDir, '.env.docker'), dockerEnv);
	}
}

async function main() {
	try {
		await showWelcome();
		const choice = await showOptions();

		switch (choice) {
			case '1':
				await quickStartLocal();
				break;
			case '2':
				await quickStartDocker();
				break;
			case '3':
				await fullSetup();
				break;
			case '4':
				await verifySetup();
				break;
			default:
				log('\nInvalid choice. Please run the wizard again.', 'yellow');
		}
	} catch (error) {
		log(`\nError: ${error.message}`, 'red');
	} finally {
		rl.close();
	}
}

// Run if called directly
if (require.main === module) {
	main();
}

module.exports = { createEmulatorEnvFile, createDockerEnvFile };
