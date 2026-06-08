/**
 * `ssrChat` (§2 / Phase 2) — wraps the SvelteKit `adapter-node` handler in an
 * `onRequest` Cloud Function (me-west1). The `chat` hosting target rewrites
 * `**` → `ssrChat`; static assets are served from `apps/chat/build/client`.
 *
 * Deploy step (`npm run deploy:chat`): `apps/chat` is built, then
 * `apps/chat/scripts/copy-ssr-to-functions.cjs` copies the adapter-node server
 * bundle (`handler.js` + `server` + `env.js` + `shims.js`) into
 * `functions/chat-build/` so it travels inside the function package. The handler
 * is imported lazily via a runtime-computed path so this file — and `tsc` —
 * compile even before the artifact is copied in.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { functionConfig } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { IncomingMessage } from 'http';
import { pathToFileURL } from 'url';

type NodeHandler = (req: unknown, res: unknown) => void;

/**
 * Firebase's functions framework parses and *drains* the request body before
 * our handler runs, so the SvelteKit (adapter-node) handler would read an empty
 * stream and `request.json()` would come back empty (e.g. POST /api/session
 * 400 "Missing idToken"). The framework keeps the original bytes on
 * `req.rawBody`; rebuild a fresh readable from them and graft on the request
 * metadata adapter-node needs, so POST/PUT bodies are readable again. Requests
 * without a body (GET, etc.) are passed through untouched.
 */
function withReplayableBody(req: IncomingMessage): IncomingMessage {
	const rawBody = (req as IncomingMessage & { rawBody?: Buffer }).rawBody;
	if (!rawBody || rawBody.length === 0) return req;

	const stream = new Readable({ read() {} });
	stream.push(rawBody);
	stream.push(null);

	const replay = stream as unknown as IncomingMessage;
	replay.headers = req.headers;
	replay.method = req.method;
	replay.url = req.url;
	replay.httpVersion = req.httpVersion;
	replay.httpVersionMajor = req.httpVersionMajor;
	replay.httpVersionMinor = req.httpVersionMinor;
	(replay as unknown as { socket: unknown }).socket = req.socket;

	return replay;
}
let cachedHandler: NodeHandler | null = null;

// Candidate locations for the copied adapter-node bundle. Depending on how the
// functions source is packaged, `chat-build/` may land at the package root
// (cwd / `/workspace`) or under the compiled tree — probe both, plus an upward
// walk from this file, and use whichever exists.
function resolveHandlerFile(): string | null {
	const candidates = [
		path.join(process.cwd(), 'chat-build', 'handler.js'),
		path.join(__dirname, '..', '..', 'chat-build', 'handler.js'),
		path.join(__dirname, '..', '..', '..', '..', 'chat-build', 'handler.js'),
	];
	for (const c of candidates) {
		if (fs.existsSync(c)) return c;
	}
	// Upward walk: from __dirname, look for `chat-build/handler.js` at each parent.
	let dir = __dirname;
	for (let i = 0; i < 8; i++) {
		const guess = path.join(dir, 'chat-build', 'handler.js');
		if (fs.existsSync(guess)) return guess;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return null;
}

async function getHandler(): Promise<NodeHandler> {
	if (cachedHandler) return cachedHandler;
	const handlerFile = resolveHandlerFile();
	if (!handlerFile) {
		let cwdListing: string[] = [];
		try {
			cwdListing = fs.readdirSync(process.cwd());
		} catch {
			// ignore
		}
		throw new Error(
			`chat-build/handler.js not found. cwd=${process.cwd()} __dirname=${__dirname} cwdEntries=[${cwdListing.join(', ')}]`,
		);
	}
	// `handler.js` is an ES module, but this function compiles to CommonJS — a
	// plain `await import()` is downlevelled by tsc to `require()`, which cannot
	// load ESM (ERR_REQUIRE_ESM) nor a `file://` URL. Build a *real* dynamic
	// `import()` via `Function` so it survives compilation and loads ESM natively.
	const importEsm = new Function('p', 'return import(p)') as (
		p: string,
	) => Promise<{ handler: NodeHandler }>;
	const mod = await importEsm(pathToFileURL(handlerFile).href);
	cachedHandler = mod.handler;

	return cachedHandler;
}

export const ssrChat = onRequest(
	{ region: functionConfig.region, memory: '512MiB', invoker: 'public' },
	async (req, res) => {
		try {
			const handler = await getHandler();
			handler(withReplayableBody(req as unknown as IncomingMessage), res);
		} catch (error) {
			logger.error('[ssrChat] handler failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			res.status(500).send('Internal Server Error');
		}
	},
);
