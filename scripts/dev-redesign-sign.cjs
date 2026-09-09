const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../apps/sign');
const projectId = 'demo-freedi-redesign';
const child = spawn(
	process.execPath,
	[
		path.join(root, 'node_modules/next/dist/bin/next'),
		...(process.argv.includes('--build') ? ['build'] : ['dev', '-p', '3012']),
	],
	{
		cwd: root,
		stdio: 'inherit',
		env: {
			...process.env,
			FIREBASE_PROJECT_ID: projectId,
			GCLOUD_PROJECT: projectId,
			USE_FIREBASE_EMULATOR: 'true',
			FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
			FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9399',
			NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
			NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
			NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: projectId + '.firebaseapp.com',
			NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
			NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: projectId + '.appspot.com',
			NEXT_PUBLIC_EMULATOR_AUTH_PORT: '9399',
			NEXT_PUBLIC_MAIN_APP_URL: 'http://localhost:5189',
			NEXT_PUBLIC_DELIBERATION_FUNCTIONS_URL: 'http://localhost:5309',
		},
	},
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code || 0));
