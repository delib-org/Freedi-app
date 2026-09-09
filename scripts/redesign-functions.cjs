// Local HTTP/callable gateway. Use Firebase emulators for background triggers.
const path = require('node:path');
const { createRequire } = require('node:module');
const base = path.resolve(__dirname, '../functions');
const localRequire = createRequire(path.join(base, 'package.json'));
const projectId = process.env.GCLOUD_PROJECT || 'demo-freedi-redesign';
if (!projectId.startsWith('demo-')) throw new Error('This local gateway requires a demo- project.');
process.env.GCLOUD_PROJECT = projectId;
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9399';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
const express = localRequire('express');
const app = express();
app.use(express.json({ limit: '1mb' }));
const handlers = require(path.join(base, 'lib/functions/src/index.js'));
for (const [name, handler] of Object.entries(handlers)) {
	if (handler?.__endpoint?.httpsTrigger || handler?.__endpoint?.callableTrigger) {
		app.all(`/${projectId}/me-west1/${name}`, handler);
		app.all(`/${name}`, handler);
	}
}
app.listen(Number(process.env.REDESIGN_FUNCTIONS_PORT || 5309), '127.0.0.1', () => {
	console.log(
		`Local HTTP/callable functions for ${projectId}. Background triggers require Firebase emulators.`,
	);
});
