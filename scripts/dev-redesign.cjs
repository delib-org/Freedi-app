// Isolated full-app frontend: Firebase Auth/Firestore/Storage emulators must already be running.
const path = require('node:path');
const { spawn } = require('node:child_process');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const projectId = 'demo-freedi-redesign';
const child = spawn(
	process.execPath,
	[
		path.join(root, 'node_modules/vite/bin/vite.js'),
		'--host',
		'127.0.0.1',
		'--port',
		'5189',
		'--strictPort',
	],
	{
		cwd: root,
		stdio: 'inherit',
		env: {
			...process.env,
			VITE_FIREBASE_API_KEY: 'demo-key',
			VITE_FIREBASE_PROJECT_ID: projectId,
			VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
			VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
			VITE_FIREBASE_APP_ID: 'demo-app',
			VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
			VITE_EMULATOR_AUTH_PORT: '9399',
			VITE_EMULATOR_FUNCTIONS_PORT: process.env.REDESIGN_FUNCTIONS_PORT || '5309',
			FREEDI_VITE_CACHE_DIR: path.join(os.tmpdir(), 'freedi-vite-full'),
		},
	},
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code || 0));
