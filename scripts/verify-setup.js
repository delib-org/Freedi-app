#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
	console.log(colors[color] + message + colors.reset);
}

function logSection(title) {
	console.log('\n' + colors.blue + colors.bright + `===== ${title} =====` + colors.reset + '\n');
}

function checkCommand(command) {
	try {
		execSync(`${command} --version`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function checkFile(filePath) {
	return fs.existsSync(path.join(process.cwd(), filePath));
}

function getNodeVersion() {
	try {
		const version = execSync('node --version', { encoding: 'utf8' }).trim();
		return version;
	} catch {
		return null;
	}
}

function getJavaVersion() {
	try {
		const version = execSync('java --version 2>&1', { encoding: 'utf8' }).split('\n')[0];
		return version;
	} catch {
		return null;
	}
}

function checkEnvVariable(envPath, variable) {
	try {
		if (!fs.existsSync(envPath)) return false;
		const content = fs.readFileSync(envPath, 'utf8');
		return content.includes(`${variable}=`) && !content.includes(`${variable}=your-`);
	} catch {
		return false;
	}
}

async function verifySetup() {
	log('🔍 Verifying Freedi Development Setup', 'bright');
	
	let errors = 0;
	let warnings = 0;

	// Check Prerequisites
	logSection('Prerequisites');

	// Node.js
	const nodeVersion = getNodeVersion();
	if (nodeVersion) {
		const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
		if (majorVersion >= 18) {
			log(`✅ Node.js ${nodeVersion}`, 'green');
		} else {
			log(`⚠️  Node.js ${nodeVersion} (requires 18+)`, 'yellow');
			warnings++;
		}
	} else {
		log('❌ Node.js not found', 'red');
		errors++;
	}

	// Java
	const javaVersion = getJavaVersion();
	if (javaVersion) {
		log(`✅ Java installed: ${javaVersion.substring(0, 50)}...`, 'green');
	} else {
		log('⚠️  Java not found (required for Firebase emulators)', 'yellow');
		warnings++;
	}

	// Firebase CLI
	if (checkCommand('firebase')) {
		log('✅ Firebase CLI installed', 'green');
	} else {
		log('❌ Firebase CLI not found', 'red');
		errors++;
	}

	// Git
	if (checkCommand('git')) {
		log('✅ Git installed', 'green');
	} else {
		log('❌ Git not found', 'red');
		errors++;
	}

	// Check Project Files
	logSection('Project Configuration');

	// Firebase configuration files
	if (checkFile('.firebaserc')) {
		log('✅ .firebaserc found', 'green');
	} else {
		log('❌ .firebaserc not found', 'red');
		errors++;
	}

	if (checkFile('firebase.json')) {
		log('✅ firebase.json found', 'green');
	} else {
		log('❌ firebase.json not found', 'red');
		errors++;
	}

	// Environment file
	if (checkFile('.env.development')) {
		log('✅ .env.development found', 'green');
		
		// Check required environment variables
		const envPath = path.join(process.cwd(), '.env.development');
		const requiredVars = [
			'VITE_FIREBASE_API_KEY',
			'VITE_FIREBASE_AUTH_DOMAIN',
			'VITE_FIREBASE_PROJECT_ID',
			'VITE_FIREBASE_STORAGE_BUCKET',
			'VITE_FIREBASE_MESSAGING_SENDER_ID',
			'VITE_FIREBASE_APP_ID'
		];
		
		let envValid = true;
		for (const varName of requiredVars) {
			if (!checkEnvVariable(envPath, varName)) {
				log(`  ❌ ${varName} not configured`, 'red');
				envValid = false;
				errors++;
			}
		}
		
		if (envValid) {
			log('  ✅ All required environment variables configured', 'green');
		}
	} else {
		log('❌ .env.development not found', 'red');
		errors++;
	}

	// Check Dependencies
	logSection('Dependencies');

	if (checkFile('node_modules')) {
		log('✅ Root dependencies installed', 'green');
	} else {
		log('❌ Root dependencies not installed (run: npm install)', 'red');
		errors++;
	}

	if (checkFile('functions/node_modules')) {
		log('✅ Functions dependencies installed', 'green');
	} else {
		log('❌ Functions dependencies not installed (run: cd functions && npm install)', 'red');
		errors++;
	}

	// Check Optional Files
	logSection('Optional Configuration');

	if (checkFile('firestore.rules')) {
		log('✅ Firestore rules found', 'green');
	} else {
		log('⚠️  firestore.rules not found', 'yellow');
		warnings++;
	}

	if (checkFile('storage.rules')) {
		log('✅ Storage rules found', 'green');
	} else {
		log('⚠️  storage.rules not found', 'yellow');
		warnings++;
	}

	// Summary
	logSection('Summary');

	if (errors === 0 && warnings === 0) {
		log('🎉 Everything looks good! You can run: npm run dev:all', 'green');
	} else if (errors === 0) {
		log(`✅ Setup is functional with ${warnings} warning(s)`, 'yellow');
		log('You can run: npm run dev:all', 'green');
	} else {
		log(`❌ Found ${errors} error(s) and ${warnings} warning(s)`, 'red');
		log('\nPlease fix the errors before proceeding.', 'red');
		
		if (!checkFile('.env.development') || !checkFile('.firebaserc') || !checkFile('firebase.json')) {
			log('\n💡 Tip: Run "npm run setup" to configure Firebase', 'cyan');
		}
		
		if (!checkFile('node_modules') || !checkFile('functions/node_modules')) {
			log('💡 Tip: Run "npm run setup:deps" to install dependencies', 'cyan');
		}
	}

	process.exit(errors > 0 ? 1 : 0);
}

verifySetup().catch((error) => {
	log(`\n❌ Verification failed: ${error.message}`, 'red');
	process.exit(1);
});