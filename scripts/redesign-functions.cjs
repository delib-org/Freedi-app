const { projectId, appPort, signPort } = require('./redesign-environment.cjs');
// Local HTTP/callable gateway. Use Firebase emulators for background triggers.
const path = require('node:path');
const { createRequire } = require('node:module');
const base = path.resolve(__dirname, '../functions');
const localRequire = createRequire(path.join(base, 'package.json'));
if (!projectId.startsWith('demo-')) throw new Error('This local gateway requires a demo- project.');
process.env.FUNCTIONS_EMULATOR = 'true';
const express = localRequire('express');
const app = express();
app.use(express.json({ limit: '1mb' }));
// The gateway is local-only; permit its explicitly configured preview ports.
const origins = require(path.join(base, 'lib/functions/src/config/cors.js')).ALLOWED_ORIGINS;
for (const port of [appPort, signPort]) for (const host of ['localhost', '127.0.0.1']) {
 const origin = `http://${host}:${port}`;
 if (!origins.includes(origin)) origins.push(origin);
}
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
