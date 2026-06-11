/**
 * `sitemap.xml` (§6 SEO) — generated from the public conversation roots. Only
 * public is eligible (unlisted is noindex, private never served to crawlers).
 */
import type { RequestHandler } from './$types';
import { loadDiscovery } from '$lib/server/conversation';

export const GET: RequestHandler = async ({ url }) => {
	let urls: string[] = ['/'];
	try {
		const roots = await loadDiscovery(500);
		urls = urls.concat(roots.map((r) => `/q/${r.statementId}`));
	} catch (e) {
		console.error('[chat] sitemap load failed:', e instanceof Error ? e.message : e);
	}

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map((path) => `  <url><loc>${url.origin}${path}</loc></url>`)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' },
	});
};
