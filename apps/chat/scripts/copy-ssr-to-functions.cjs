#!/usr/bin/env node

/**
 * Copies the SvelteKit `adapter-node` server bundle into `functions/chat-build/`
 * so the `ssrChat` Cloud Function can `import('../../chat-build/handler.js')` at
 * runtime. The static client assets (`build/client`) are served by Firebase
 * Hosting and are intentionally NOT copied — only the server runtime travels
 * inside the function package.
 *
 * Run after `apps/chat` is built (`npm run build`), before `firebase deploy`.
 */

const fs = require('fs');
const path = require('path');

const CHAT_DIR = path.join(__dirname, '..');
const BUILD_DIR = path.join(CHAT_DIR, 'build');
const DEST_DIR = path.join(CHAT_DIR, '..', '..', 'functions', 'chat-build');

// Server-runtime entries the adapter-node `handler.js` depends on. `client/` is
// served by Hosting, so it is deliberately excluded to keep the function small.
const ENTRIES = ['handler.js', 'index.js', 'env.js', 'shims.js', 'server'];

function main() {
	if (!fs.existsSync(BUILD_DIR)) {
		console.error(`[copy-ssr] build dir missing: ${BUILD_DIR}\nRun "npm run build" in apps/chat first.`);
		process.exit(1);
	}

	fs.rmSync(DEST_DIR, { recursive: true, force: true });
	fs.mkdirSync(DEST_DIR, { recursive: true });

	for (const entry of ENTRIES) {
		const src = path.join(BUILD_DIR, entry);
		if (!fs.existsSync(src)) {
			console.error(`[copy-ssr] expected build artifact missing: ${src}`);
			process.exit(1);
		}
		fs.cpSync(src, path.join(DEST_DIR, entry), { recursive: true });
	}

	console.info(`[copy-ssr] copied ${ENTRIES.length} entries → ${path.relative(process.cwd(), DEST_DIR)}`);
}

main();
