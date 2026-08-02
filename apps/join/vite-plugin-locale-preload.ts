import type { Plugin, IndexHtmlTransformResult } from 'vite';
import type { OutputBundle, OutputChunk } from 'rollup';

/**
 * Emits an inline boot script that preloads the visitor's locale chunk.
 *
 * Splitting translations per language (see `src/lib/i18n.ts`) removes ~37 kB
 * gzipped from the entry chunk, but naively it trades those bytes for a round
 * trip: the browser can't know a locale chunk exists until the entry chunk has
 * downloaded, parsed, and reached its `import()`. On the slow connections this
 * whole effort targets, that round trip can cost more than the bytes saved.
 *
 * So we resolve the hashed locale filenames at build time, hand them to a tiny
 * script in `<head>`, and let it inject a `<link rel="modulepreload">` for the
 * one language this visitor will actually use. The request then starts during
 * HTML parse — alongside the entry bundle, not behind it — and the later
 * `import()` is served from the preload cache.
 *
 * The same script sets `dir`/`lang` on `<html>` immediately, so the boot splash
 * renders right-to-left from the first frame instead of flipping, and preloads
 * the Hebrew font subset for Hebrew visitors (Assistant has no Arabic coverage,
 * so `ar`/`fa` fall through to system fonts and need no font preload).
 *
 * Language detection here MUST mirror `detectLanguage()` in `src/lib/i18n.ts`.
 * A mismatch only wastes a preload — it can't render the wrong language, since
 * i18n.ts remains the sole authority on what actually gets applied.
 */

/** Locales with their own chunk. English is inlined in the entry chunk. */
const LOCALES = ['ar', 'de', 'es', 'fa', 'he', 'nl'];
const RTL = ['ar', 'fa', 'he'];

function findLocaleChunks(bundle: OutputBundle): Record<string, string> {
	const map: Record<string, string> = {};

	for (const file of Object.values(bundle)) {
		if (file.type !== 'chunk') continue;
		const chunk = file as OutputChunk;
		const id = chunk.facadeModuleId;
		if (!id) continue;

		const match = /[\\/]src[\\/]lib[\\/]locales[\\/]([a-z]{2})\.ts$/.exec(id);
		if (match && LOCALES.includes(match[1])) {
			map[match[1]] = `/${chunk.fileName}`;
		}
	}

	return map;
}

function bootScript(chunks: Record<string, string>): string {
	// Kept deliberately small and dependency-free — it runs before anything
	// else and blocks HTML parsing for the length of its execution.
	return `(function(){try{
var C=${JSON.stringify(chunks)};
var R=${JSON.stringify(RTL)};
var l=null;
try{l=new URLSearchParams(location.search).get('lang')}catch(e){}
if(!C[l]&&l!=='en'){try{l=localStorage.getItem('freedi_join_lang')}catch(e){l=null}}
if(!C[l]&&l!=='en'){l=(navigator.language||'en').split('-')[0]}
if(!C[l]&&l!=='en'){l='en'}
var d=document.documentElement;
d.lang=l;
d.dir=R.indexOf(l)>-1?'rtl':'ltr';
function p(href,as,type){var k=document.createElement('link');k.rel=as==='font'?'preload':'modulepreload';k.href=href;if(as){k.as=as}if(type){k.type=type}k.crossOrigin='anonymous';document.head.appendChild(k)}
if(C[l]){p(C[l])}
if(l==='he'){p('/fonts/assistant-hebrew.woff2','font','font/woff2')}
}catch(e){}})();`;
}

export function localePreload(): Plugin {
	return {
		name: 'join-locale-preload',
		// `post` so the bundle is complete and chunk hashes are final.
		enforce: 'post',
		apply: 'build',

		transformIndexHtml: {
			order: 'post',
			handler(_html, ctx): IndexHtmlTransformResult {
				if (!ctx.bundle) return [];

				const chunks = findLocaleChunks(ctx.bundle);
				if (Object.keys(chunks).length === 0) {
					this.warn(
						'No locale chunks found in the bundle — locale preloading is inactive. ' +
							'Did the dynamic imports in src/lib/i18n.ts change shape?',
					);

					return [];
				}

				return [
					{
						tag: 'script',
						attrs: { type: 'text/javascript' },
						children: bootScript(chunks),
						injectTo: 'head',
					},
				];
			},
		},
	};
}
