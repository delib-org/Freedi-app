#!/usr/bin/env node

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function question(query) {
	return new Promise((resolve) => rl.question(query, resolve));
}

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

async function setupFirebase() {
	log('🔥 Welcome to Freedi Firebase Project Setup Wizard', 'bright');
	log('This wizard will help you create and configure your own Firebase project.\n', 'cyan');

	// Check prerequisites
	logSection('Checking Prerequisites');

	// Check Node.js
	if (!checkCommand('node')) {
		log('❌ Node.js is not installed. Please install Node.js 18+ first.', 'red');
		process.exit(1);
	}
	log('✅ Node.js found', 'green');

	// Check Firebase CLI
	if (!checkCommand('firebase')) {
		log('⚠️  Firebase CLI not found. Installing...', 'yellow');
		try {
			execSync('npm install -g firebase-tools', { stdio: 'inherit' });
			log('✅ Firebase CLI installed successfully', 'green');
		} catch (error) {
			log('❌ Failed to install Firebase CLI. Please install it manually: npm install -g firebase-tools', 'red');
			process.exit(1);
		}
	} else {
		log('✅ Firebase CLI found', 'green');
	}

	// Firebase login
	logSection('Firebase Authentication');
	log('You need to be logged in to Firebase to continue.', 'cyan');
	const isLoggedIn = await question('Are you already logged in to Firebase? (y/n): ');
	
	if (isLoggedIn.toLowerCase() !== 'y') {
		log('\nOpening Firebase login in your browser...', 'yellow');
		try {
			execSync('firebase login', { stdio: 'inherit' });
		} catch (error) {
			log('❌ Firebase login failed. Please try again.', 'red');
			process.exit(1);
		}
	}

	// Create new project
	logSection('Create Firebase Project');
	log('Choose a unique project ID (lowercase letters, numbers, and hyphens only)', 'cyan');
	log('Example: my-freedi-dev', 'cyan');
	
	const projectId = await question('\nEnter your project ID: ');
	
	if (!/^[a-z0-9-]+$/.test(projectId)) {
		log('❌ Invalid project ID format. Use only lowercase letters, numbers, and hyphens.', 'red');
		process.exit(1);
	}

	log(`\nCreating Firebase project: ${projectId}...`, 'yellow');
	
	try {
		execSync(`firebase projects:create ${projectId} --display-name "${projectId}"`, { stdio: 'inherit' });
		log('✅ Project created successfully!', 'green');
	} catch (error) {
		if (error.message.includes('already exists')) {
			log('⚠️  Project already exists, using existing project...', 'yellow');
		} else {
			log('❌ Failed to create project. Please check your permissions and try again.', 'red');
			process.exit(1);
		}
	}

	// Set active project
	try {
		execSync(`firebase use ${projectId}`, { stdio: 'inherit' });
		log('✅ Project set as active', 'green');
	} catch (error) {
		log('❌ Failed to set active project', 'red');
		process.exit(1);
	}

	// Enable services
	logSection('Enable Firebase Services');
	log('Please enable the following services in your Firebase Console:', 'cyan');
	log(`\n${colors.bright}https://console.firebase.google.com/project/${projectId}${colors.reset}\n`);
	
	log('1. Authentication:', 'yellow');
	log('   - Go to Authentication → Sign-in method', 'reset');
	log('   - Enable Email/Password', 'reset');
	log('   - Enable Google (optional but recommended)\n', 'reset');
	
	log('2. Firestore Database:', 'yellow');
	log('   - Go to Firestore Database → Create database', 'reset');
	log('   - Choose "Start in test mode"', 'reset');
	log('   - Select your preferred location\n', 'reset');
	
	log('3. Storage:', 'yellow');
	log('   - Go to Storage → Get started', 'reset');
	log('   - Choose "Start in test mode"\n', 'reset');
	
	log('4. Functions (optional, requires Blaze plan):', 'yellow');
	log('   - Go to Functions → Get started', 'reset');
	log('   - Follow the upgrade prompts if needed\n', 'reset');

	await question('\nPress Enter when you have enabled all required services...');

	// Get Firebase configuration
	logSection('Firebase Configuration');
	log('Now we need to get your Firebase configuration values.', 'cyan');
	log('\nIn the Firebase Console:', 'cyan');
	log('1. Go to Project Settings (gear icon) → General', 'reset');
	log('2. Scroll down to "Your apps"', 'reset');
	log('3. Click "Add app" → Web app (</> icon)', 'reset');
	log('4. Register app with any nickname (e.g., "Freedi Dev")', 'reset');
	log('5. Copy the configuration values\n', 'reset');

	await question('Press Enter when you have the configuration screen open...');

	log('\nPlease enter the following values from your Firebase config:', 'yellow');
	
	const config = {
		apiKey: await question('API Key: '),
		authDomain: await question(`Auth Domain (press Enter for ${projectId}.firebaseapp.com): `) || `${projectId}.firebaseapp.com`,
		projectId: projectId,
		storageBucket: await question(`Storage Bucket (press Enter for ${projectId}.appspot.com): `) || `${projectId}.appspot.com`,
		messagingSenderId: await question('Messaging Sender ID: '),
		appId: await question('App ID: '),
		measurementId: await question('Measurement ID (optional, press Enter to skip): '),
		vapidKey: await question('VAPID Key for notifications (optional, press Enter to skip): '),
	};

	// Create configuration files
	logSection('Creating Configuration Files');

	// Create .env.development
	const envContent = `# Firebase Configuration for Development
VITE_FIREBASE_API_KEY=${config.apiKey}
VITE_FIREBASE_AUTH_DOMAIN=${config.authDomain}
VITE_FIREBASE_DATABASE_URL=https://${projectId}.firebaseio.com
VITE_FIREBASE_PROJECT_ID=${config.projectId}
VITE_FIREBASE_STORAGE_BUCKET=${config.storageBucket}
VITE_FIREBASE_MESSAGING_SENDER_ID=${config.messagingSenderId}
VITE_FIREBASE_APP_ID=${config.appId}
VITE_FIREBASE_MEASUREMENT_ID=${config.measurementId || ''}
VITE_FIREBASE_VAPID_KEY=${config.vapidKey || ''}
`;

	fs.writeFileSync(path.join(process.cwd(), '.env.development'), envContent);
	log('✅ Created .env.development', 'green');

	// Create firebase.json
	const firebaseJson = {
		firestore: {
			rules: 'firestore.rules',
			indexes: 'firestore.indexes.json',
		},
		functions: [
			{
				source: 'functions',
				predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
			},
		],
		hosting: [
			{
				target: 'dev',
				public: 'dist',
				ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
				rewrites: [
					{
						source: '**',
						destination: '/index.html',
					},
				],
			},
		],
		emulators: {
			auth: {
				port: 9099,
			},
			functions: {
				port: 5001,
			},
			firestore: {
				port: 8080,
			},
			storage: {
				port: 9199,
			},
			ui: {
				enabled: true,
				port: 5002,
			},
			singleProjectMode: true,
			hosting: {
				port: 5000,
			},
		},
		storage: {
			rules: 'storage.rules',
		},
	};

	fs.writeFileSync(path.join(process.cwd(), 'firebase.json'), JSON.stringify(firebaseJson, null, 2));
	log('✅ Created firebase.json', 'green');

	// Create .firebaserc
	const firebaserc = {
		projects: {
			dev: projectId,
		},
		targets: {
			[projectId]: {
				hosting: {
					dev: [projectId],
				},
			},
		},
		etags: {},
		dataconnectEmulatorConfig: {},
	};

	fs.writeFileSync(path.join(process.cwd(), '.firebaserc'), JSON.stringify(firebaserc, null, 2));
	log('✅ Created .firebaserc', 'green');

	// Success message
	logSection('Setup Complete! 🎉');
	log('Your Firebase project has been configured successfully!', 'green');
	log('\nNext steps:', 'yellow');
	log('1. Run: npm install', 'cyan');
	log('2. Run: cd functions && npm install && cd ..', 'cyan');
	log('3. Run: npm run dev:all', 'cyan');
	log('\nYour app will be available at http://localhost:5173', 'bright');
	
	log('\nUseful commands:', 'yellow');
	log('- npm run dev:all     # Start all development servers', 'cyan');
	log('- npm run build       # Build for production', 'cyan');
	log('- npm run deploy:dev  # Deploy to Firebase', 'cyan');
	
	log('\nHappy coding! 🚀', 'bright');

	rl.close();
}

// Run the setup
setupFirebase().catch((error) => {
	log(`\n❌ Setup failed: ${error.message}`, 'red');
	rl.close();
	process.exit(1);
});