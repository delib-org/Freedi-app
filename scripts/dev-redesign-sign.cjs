const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../apps/sign');
const { projectId, config, env, appPort, signPort, functionsPort } = require('./redesign-environment.cjs');
const child = spawn(
	process.execPath,
	[
		path.join(root, 'node_modules/next/dist/bin/next'),
		...(process.argv.includes('--build') ? ['build'] : ['dev', '-p', signPort]),
	],
	{
		cwd: root,
		stdio: 'inherit',
		env: {
			...process.env,
			...env,
			SIGN_STANDALONE: 'false',
			SIGN_DIST_DIR: process.env.SIGN_DIST_DIR || (process.argv.includes('--build') ? '.next-redesign-check' : '.next-redesign-dev'),
			FIREBASE_PROJECT_ID: projectId,
			GCLOUD_PROJECT: projectId,
			USE_FIREBASE_EMULATOR: 'true',


			NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
			NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
			NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: projectId + '.firebaseapp.com',
			NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
			NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: projectId + '.appspot.com',
			NEXT_PUBLIC_EMULATOR_AUTH_PORT: String(config.auth.port),
			NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: String(config.firestore.port),
			NEXT_PUBLIC_MAIN_APP_URL: `http://localhost:${appPort}`,
			NEXT_PUBLIC_DELIBERATION_FUNCTIONS_URL: `http://localhost:${functionsPort}`,
		},
	},
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code || 0));
