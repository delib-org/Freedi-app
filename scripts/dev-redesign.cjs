// Isolated full-app frontend: Firebase Auth/Firestore/Storage emulators must already be running.
const path = require('node:path');
const { spawn } = require('node:child_process');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const { projectId, config, env, appPort, signPort, functionsPort } = require('./redesign-environment.cjs');
const child = spawn(
	process.execPath,
	[
		path.join(root, 'node_modules/vite/bin/vite.js'),
		'--host',
		'127.0.0.1',
		'--port',
		appPort,
		'--strictPort',
	],
	{
		cwd: root,
		stdio: 'inherit',
		env: {
			...process.env,
			...env,
			VITE_FIREBASE_API_KEY: 'demo-key',
			VITE_SIGN_APP_URL: `http://localhost:${signPort}`,
			VITE_FIREBASE_PROJECT_ID: projectId,
			VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
			VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
			VITE_FIREBASE_APP_ID: 'demo-app',
			VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
			VITE_EMULATOR_AUTH_PORT: String(config.auth.port),
			VITE_EMULATOR_FIRESTORE_PORT: String(config.firestore.port),
			VITE_EMULATOR_STORAGE_PORT: String(config.storage.port),
			VITE_EMULATOR_FUNCTIONS_PORT: functionsPort,
			FREEDI_VITE_CACHE_DIR: path.join(os.tmpdir(), 'freedi-vite-full'),
		},
	},
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code || 0));
