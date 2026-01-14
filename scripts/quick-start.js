#!/usr/bin/env node

/**
 * Freedi Quick Start Wizard
 *
 * This wizard provides multiple paths for getting started:
 * 1. Quick Start - Uses Firebase emulators (no account needed)
 * 2. Docker - Containerized environment
 * 3. Full Setup - Connect to your own Firebase project
 *
 * Created by WizCol.com: fostering collaboration
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');

// ANSI color codes and styles
const c = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	italic: '\x1b[3m',
	underline: '\x1b[4m',
	blink: '\x1b[5m',
	inverse: '\x1b[7m',
	hidden: '\x1b[8m',

	// Foreground colors
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',

	// Bright foreground colors
	brightBlack: '\x1b[90m',
	brightRed: '\x1b[91m',
	brightGreen: '\x1b[92m',
	brightYellow: '\x1b[93m',
	brightBlue: '\x1b[94m',
	brightMagenta: '\x1b[95m',
	brightCyan: '\x1b[96m',
	brightWhite: '\x1b[97m',

	// Background colors
	bgBlack: '\x1b[40m',
	bgRed: '\x1b[41m',
	bgGreen: '\x1b[42m',
	bgYellow: '\x1b[43m',
	bgBlue: '\x1b[44m',
	bgMagenta: '\x1b[45m',
	bgCyan: '\x1b[46m',
	bgWhite: '\x1b[47m',
};

// Gradient colors for the logo
const gradient = [c.brightCyan, c.cyan, c.brightBlue, c.blue, c.brightMagenta];

// ASCII Art Logo
const logo = `
    ███████╗██████╗ ███████╗███████╗██████╗ ██╗
    ██╔════╝██╔══██╗██╔════╝██╔════╝██╔══██╗██║
    █████╗  ██████╔╝█████╗  █████╗  ██║  ██║██║
    ██╔══╝  ██╔══██╗██╔══╝  ██╔══╝  ██║  ██║██║
    ██║     ██║  ██║███████╗███████╗██████╔╝██║
    ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═════╝ ╚═╝
`;

const logoSmall = `
   ____                   _ _
  |  __| __ ___  ___  __| (_)
  | |__ | '__/ _ \\/ _ \\/ _\` | |
  |  __|| | |  __/  __/ (_| | |
  |_|   |_|  \\___|\\___|\\__,_|_|
`;

// Spinner frames for loading animation
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const progressBar = ['░', '▒', '▓', '█'];
const checkmarks = { success: '✓', fail: '✗', warn: '⚠', info: 'ℹ', arrow: '→', star: '★' };

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function question(query) {
	return new Promise((resolve) => rl.question(query, resolve));
}

// Sleep utility
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Clear line and move cursor
function clearLine() {
	process.stdout.write('\r\x1b[K');
}

// Print with color
function print(text, color = '') {
	process.stdout.write(color + text + c.reset);
}

function println(text = '', color = '') {
	console.info(color + text + c.reset);
}

// Animated typing effect
async function typeText(text, delay = 30, color = '') {
	for (const char of text) {
		process.stdout.write(color + char + c.reset);
		await sleep(delay);
	}
}

// Animated spinner
class Spinner {
	constructor(text) {
		this.text = text;
		this.frameIndex = 0;
		this.interval = null;
	}

	start() {
		this.interval = setInterval(() => {
			clearLine();
			const frame = spinnerFrames[this.frameIndex];
			print(`  ${c.cyan}${frame}${c.reset} ${this.text}`);
			this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length;
		}, 80);
	}

	update(text) {
		this.text = text;
	}

	stop(finalText, success = true) {
		clearInterval(this.interval);
		clearLine();
		const icon = success ? `${c.green}${checkmarks.success}` : `${c.red}${checkmarks.fail}`;
		println(`  ${icon}${c.reset} ${finalText}`);
	}

	warn(finalText) {
		clearInterval(this.interval);
		clearLine();
		println(`  ${c.yellow}${checkmarks.warn}${c.reset} ${finalText}`);
	}
}

// Progress bar animation
async function showProgress(text, duration = 2000) {
	const width = 30;
	const steps = 20;
	const stepDuration = duration / steps;

	for (let i = 0; i <= steps; i++) {
		clearLine();
		const filled = Math.floor((i / steps) * width);
		const empty = width - filled;
		const percent = Math.floor((i / steps) * 100);

		const bar = c.green + '█'.repeat(filled) + c.brightBlack + '░'.repeat(empty) + c.reset;
		print(`  ${text} [${bar}] ${percent}%`);

		await sleep(stepDuration);
	}
	println();
}

// Draw a fancy box
function drawBox(lines, options = {}) {
	const { color = c.cyan, padding = 1, title = '' } = options;

	const maxLength = Math.max(...lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length), title.length);
	const innerWidth = maxLength + padding * 2;

	// Top border
	if (title) {
		const titlePadded = ` ${title} `;
		const leftBorder = Math.floor((innerWidth - titlePadded.length) / 2);
		const rightBorder = innerWidth - titlePadded.length - leftBorder;
		println(color + '╭' + '─'.repeat(leftBorder) + c.bright + titlePadded + c.reset + color + '─'.repeat(rightBorder) + '╮' + c.reset);
	} else {
		println(color + '╭' + '─'.repeat(innerWidth) + '╮' + c.reset);
	}

	// Content
	lines.forEach((line) => {
		const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, '').length;
		const rightPad = maxLength - visibleLength;
		println(color + '│' + c.reset + ' '.repeat(padding) + line + ' '.repeat(rightPad + padding) + color + '│' + c.reset);
	});

	// Bottom border
	println(color + '╰' + '─'.repeat(innerWidth) + '╯' + c.reset);
}

// Draw decorative separator
function drawSeparator(char = '─', length = 50, color = c.brightBlack) {
	println(color + char.repeat(length) + c.reset);
}

// Animate the logo with gradient
async function animateLogo() {
	console.clear();
	println();

	const lines = logo.trim().split('\n');

	// Animate each line with a slight delay
	for (let i = 0; i < lines.length; i++) {
		const colorIndex = i % gradient.length;
		println(gradient[colorIndex] + c.bright + lines[i] + c.reset);
		await sleep(50);
	}

	println();
}

// Show welcome screen with animations
async function showWelcome() {
	await animateLogo();

	// Subtitle with typing effect
	print('    ');
	await typeText('Open-source deliberation platform', 25, c.brightWhite);
	println();

	print('    ');
	await typeText('for communities and organizations', 25, c.dim);
	println();

	println();

	// Credit line
	println(`    ${c.brightBlack}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
	println();
	print('    ');
	await typeText('Created by ', 20, c.dim);
	await typeText('WizCol.com', 40, c.brightCyan + c.bright);
	await typeText(': fostering collaboration', 20, c.dim);
	println();
	println();

	await sleep(500);
}

// Show menu options with nice formatting
async function showOptions() {
	println();
	println(`  ${c.bright}${c.white}Choose your setup path:${c.reset}`);
	println();

	// Option 1 - Quick Start
	println(`  ${c.bgGreen}${c.black}${c.bright} 1 ${c.reset} ${c.green}${c.bright}Quick Start${c.reset} ${c.dim}(Recommended for trying out)${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Uses Firebase emulators - no account needed${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Ready in ~2 minutes${c.reset}`);
	println();

	// Option 2 - Docker
	println(`  ${c.bgBlue}${c.white}${c.bright} 2 ${c.reset} ${c.blue}${c.bright}Docker Quick Start${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Consistent environment with Docker Compose${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Includes all dependencies${c.reset}`);
	println();

	// Option 3 - Full Setup
	println(`  ${c.bgYellow}${c.black}${c.bright} 3 ${c.reset} ${c.yellow}${c.bright}Full Setup${c.reset} ${c.dim}(For contributors/deployment)${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Connect to your own Firebase project${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Required for production deployment${c.reset}`);
	println();

	// Option 4 - Verify
	println(`  ${c.bgMagenta}${c.white}${c.bright} 4 ${c.reset} ${c.magenta}${c.bright}Verify Setup${c.reset}`);
	println(`      ${c.dim}${checkmarks.arrow} Check if everything is configured correctly${c.reset}`);
	println();

	drawSeparator('─', 50);
	println();

	const choice = await question(`  ${c.bright}Enter your choice (1-4): ${c.reset}`);
	return choice.trim();
}

// Utility functions
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

// Quick Start Local
async function quickStartLocal() {
	println();
	drawBox(
		[
			`${c.green}${c.bright}Quick Start${c.reset} - Local Development`,
			'',
			'Setting up with Firebase Emulators',
		],
		{ color: c.green, title: checkmarks.star + ' SETUP' }
	);
	println();

	// Check prerequisites with spinner
	const spinner = new Spinner('Checking prerequisites...');
	spinner.start();
	await sleep(500);

	const node = checkNodeVersion();
	if (!node.isValid) {
		spinner.stop(`Node.js ${node.version || 'not found'}`, false);
		println();
		println(`  ${c.red}${checkmarks.fail} Please install Node.js 18+ from https://nodejs.org/${c.reset}`);
		return false;
	}
	spinner.stop(`Node.js ${node.version}`, true);

	// Check Java
	const javaSpinner = new Spinner('Checking Java installation...');
	javaSpinner.start();
	await sleep(300);

	if (!checkJava()) {
		javaSpinner.warn('Java not found (required for Firebase emulators)');
		println();
		println(`  ${c.yellow}${checkmarks.info} Install Java 11+ from https://adoptium.net/${c.reset}`);
		println(`  ${c.cyan}${checkmarks.info} Or use Docker Quick Start (option 2) instead${c.reset}`);
		println();

		const proceed = await question(`  ${c.yellow}Continue anyway? (y/n): ${c.reset}`);
		if (proceed.toLowerCase() !== 'y') {
			return false;
		}
	} else {
		javaSpinner.stop('Java installed', true);
	}

	// Check Firebase CLI
	const firebaseSpinner = new Spinner('Checking Firebase CLI...');
	firebaseSpinner.start();
	await sleep(300);

	if (!checkCommand('firebase')) {
		firebaseSpinner.warn('Firebase CLI not found - installing...');
		try {
			execSync('npm install -g firebase-tools', { stdio: 'inherit' });
			println(`  ${c.green}${checkmarks.success} Firebase CLI installed${c.reset}`);
		} catch {
			println(`  ${c.red}${checkmarks.fail} Failed to install Firebase CLI${c.reset}`);
			println(`  ${c.yellow}Try: npm install -g firebase-tools${c.reset}`);
			return false;
		}
	} else {
		firebaseSpinner.stop('Firebase CLI installed', true);
	}

	// Create environment files
	println();
	const envSpinner = new Spinner('Creating environment configuration...');
	envSpinner.start();
	createEmulatorEnvFile();
	await sleep(500);
	envSpinner.stop('Environment files created', true);

	// Install dependencies with progress
	println();
	println(`  ${c.cyan}${checkmarks.info} Installing dependencies (this may take a few minutes)...${c.reset}`);
	println();

	try {
		execSync('npm install', { stdio: 'inherit' });
		println(`  ${c.green}${checkmarks.success} Root dependencies installed${c.reset}`);

		execSync('cd functions && npm install', { stdio: 'inherit', shell: true });
		println(`  ${c.green}${checkmarks.success} Functions dependencies installed${c.reset}`);

		if (fileExists('packages/shared-types/package.json')) {
			execSync('cd packages/shared-types && npm install && npm run build', {
				stdio: 'inherit',
				shell: true,
			});
			println(`  ${c.green}${checkmarks.success} Shared packages built${c.reset}`);
		}
	} catch (error) {
		println(`  ${c.red}${checkmarks.fail} Failed to install dependencies${c.reset}`);
		println(`  ${c.dim}Error: ${error.message}${c.reset}`);
		return false;
	}

	// Success message
	println();
	await showSuccessScreen('npm run dev:emulator', [
		'Web app at http://localhost:5173',
		'Emulator UI at http://localhost:4000',
	]);

	return true;
}

// Quick Start Docker
async function quickStartDocker() {
	println();
	drawBox(
		[
			`${c.blue}${c.bright}Docker Quick Start${c.reset}`,
			'',
			'Setting up containerized environment',
		],
		{ color: c.blue, title: checkmarks.star + ' DOCKER' }
	);
	println();

	// Check Docker
	const spinner = new Spinner('Checking Docker installation...');
	spinner.start();
	await sleep(500);

	if (!checkDocker()) {
		spinner.stop('Docker not found', false);
		println();
		println(`  ${c.yellow}${checkmarks.info} Please install Docker Desktop from:${c.reset}`);
		println(`  ${c.cyan}https://www.docker.com/products/docker-desktop${c.reset}`);
		return false;
	}
	spinner.stop('Docker installed', true);

	// Create Docker environment file
	const envSpinner = new Spinner('Creating Docker environment configuration...');
	envSpinner.start();
	createDockerEnvFile();
	await sleep(500);
	envSpinner.stop('Environment files created', true);

	// Ask to start containers
	println();
	println(`  ${c.cyan}${checkmarks.info} Starting Docker containers (first run may take several minutes)${c.reset}`);
	println(`  ${c.dim}This will download images and install all dependencies.${c.reset}`);
	println();

	const proceed = await question(`  ${c.yellow}Start Docker containers now? (y/n): ${c.reset}`);
	if (proceed.toLowerCase() !== 'y') {
		println();
		println(`  ${c.cyan}${checkmarks.info} To start later, run:${c.reset}`);
		println(`  ${c.bright}docker compose up${c.reset}`);
		return true;
	}

	try {
		const dockerProcess = spawn('docker', ['compose', 'up', '--build'], {
			stdio: 'inherit',
			cwd: process.cwd(),
		});

		dockerProcess.on('error', (error) => {
			println(`  ${c.red}${checkmarks.fail} Docker error: ${error.message}${c.reset}`);
		});

		println();
		println(`  ${c.green}${checkmarks.success} Docker containers starting...${c.reset}`);
		println(`  ${c.dim}Press Ctrl+C to stop${c.reset}`);
	} catch (error) {
		println(`  ${c.red}${checkmarks.fail} Failed to start Docker: ${error.message}${c.reset}`);
		return false;
	}

	return true;
}

// Full Setup
async function fullSetup() {
	println();
	drawBox(
		[
			`${c.yellow}${c.bright}Full Setup${c.reset} - Firebase Project`,
			'',
			'Connect to your own Firebase project',
		],
		{ color: c.yellow, title: checkmarks.star + ' FIREBASE' }
	);
	println();

	println(`  ${c.dim}This will run the Firebase setup wizard.${c.reset}`);
	println(`  ${c.dim}You will need a Firebase account.${c.reset}`);
	println();

	const proceed = await question(`  ${c.yellow}Continue with full setup? (y/n): ${c.reset}`);
	if (proceed.toLowerCase() !== 'y') {
		return false;
	}

	try {
		require('./setup-firebase.js');
	} catch {
		execSync('node scripts/setup-firebase.js', { stdio: 'inherit' });
	}

	return true;
}

// Verify Setup
async function verifySetup() {
	println();
	drawBox(
		[
			`${c.magenta}${c.bright}Verify Setup${c.reset}`,
			'',
			'Checking your configuration',
		],
		{ color: c.magenta, title: checkmarks.star + ' VERIFY' }
	);
	println();

	try {
		execSync('node scripts/verify-setup.js', { stdio: 'inherit' });
	} catch {
		// verify-setup.js handles its own exit code
	}

	return true;
}

// Success screen
async function showSuccessScreen(command, endpoints) {
	println();

	// Animated success header
	const successLines = [
		'',
		`${c.green}${c.bright}    ✨ Setup Complete! ✨${c.reset}`,
		'',
	];

	for (const line of successLines) {
		println(line);
		await sleep(100);
	}

	drawBox(
		[
			`${c.bright}To start the development server:${c.reset}`,
			'',
			`  ${c.cyan}${c.bright}${command}${c.reset}`,
			'',
			`${c.dim}This will start:${c.reset}`,
			...endpoints.map((e) => `  ${c.green}${checkmarks.arrow}${c.reset} ${e}`),
		],
		{ color: c.green, title: ' SUCCESS ' }
	);

	println();
	println(`  ${c.brightCyan}Happy coding! 🚀${c.reset}`);
	println();
	println(`  ${c.dim}Created by WizCol.com: fostering collaboration${c.reset}`);
	println();
}

// Create emulator environment file
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

	const envDir = path.join(process.cwd(), 'env');
	if (!fs.existsSync(envDir)) {
		fs.mkdirSync(envDir, { recursive: true });
	}

	const devEnvPath = path.join(envDir, '.env.dev');
	if (!fs.existsSync(devEnvPath)) {
		fs.writeFileSync(devEnvPath, emulatorEnv);
	}

	const viteEnvPath = path.join(process.cwd(), '.env.development');
	if (!fs.existsSync(viteEnvPath)) {
		fs.writeFileSync(viteEnvPath, emulatorEnv);
	}

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

// Create Docker environment file
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

	const mcDir = path.join(process.cwd(), 'apps', 'mass-consensus');
	if (fs.existsSync(mcDir)) {
		fs.writeFileSync(path.join(mcDir, '.env.docker'), dockerEnv);
	}

	const signDir = path.join(process.cwd(), 'apps', 'sign');
	if (fs.existsSync(signDir)) {
		fs.writeFileSync(path.join(signDir, '.env.docker'), dockerEnv);
	}
}

// Main function
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
				println();
				println(`  ${c.yellow}${checkmarks.warn} Invalid choice. Please run the wizard again.${c.reset}`);
		}
	} catch (error) {
		println();
		println(`  ${c.red}${checkmarks.fail} Error: ${error.message}${c.reset}`);
	} finally {
		rl.close();
	}
}

// Run if called directly
if (require.main === module) {
	main();
}

module.exports = { createEmulatorEnvFile, createDockerEnvFile };
