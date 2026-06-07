/**
 * `ssrChat` (§2 / Phase 2) — wraps the SvelteKit `adapter-node` handler in an
 * `onRequest` Cloud Function (me-west1). The `chat` hosting target rewrites
 * `**` → `ssrChat`; static assets are served from `apps/chat/build/client`.
 *
 * Deploy step: `apps/chat` is built with `npm run build:chat`, and its
 * `build/handler.js` + `build/server` are copied into `functions/chat-build/`
 * before deploy (the SvelteKit server bundle must travel inside the function
 * package). The handler is imported lazily via a runtime-computed path so this
 * file — and `tsc` — compile even before the artifact is copied in.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { functionConfig } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';

type NodeHandler = (req: unknown, res: unknown) => void;
let cachedHandler: NodeHandler | null = null;

async function getHandler(): Promise<NodeHandler> {
	if (cachedHandler) return cachedHandler;
	// Runtime-computed specifier: keeps tsc from resolving the (deploy-time-only)
	// artifact at compile time.
	const handlerPath = '../../chat-build/handler.js';
	const mod = (await import(handlerPath)) as { handler: NodeHandler };
	cachedHandler = mod.handler;

	return cachedHandler;
}

export const ssrChat = onRequest(
	{ region: functionConfig.region, memory: '512MiB', invoker: 'public' },
	async (req, res) => {
		try {
			const handler = await getHandler();
			handler(req, res);
		} catch (error) {
			logger.error('[ssrChat] handler failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			res.status(500).send('Internal Server Error');
		}
	},
);
