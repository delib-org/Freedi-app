// Slow-4G + 4x CPU throttled load of the student entry (/c/:code), IA section 9b.
//
//   # build against your emulators, into a scratch dir, then measure:
//   VITE_EMULATOR_AUTH_PORT=9135 VITE_EMULATOR_FIRESTORE_PORT=8135 \
//     VITE_EMULATOR_DATABASE_PORT=9035 VITE_EMULATOR_FUNCTIONS_PORT=5035 \
//     npx vite build --outDir /tmp/join-class-perf
//   node scripts/perf-throttle.mjs --dist=/tmp/join-class-perf [--runs=5] [--code=000000]
//
// Serves the dist over localhost WITH gzip (like Firebase Hosting; vite preview
// does not compress, which would triple the bytes), throttles through the Chrome
// DevTools Protocol (Lighthouse's "slow 4G": 1.6 Mbps down, 750 kbps up, 150 ms
// RTT, CPU x4) and prints the median of N cold-cache runs:
//   FCP, LCP         PerformanceObserver paint / largest-contentful-paint
//   contentReady     the code screen has resolved (route replaced / card shown):
//                    the "TTI-ish" moment a student can act
//   transferred      encoded bytes over the wire up to contentReady
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const DIST = resolve(arg('dist', 'dist'));
const RUNS = Number(arg('runs', '5'));
const CODE = arg('code', '000000');
const PORT = Number(arg('port', '3036'));
const KBIT = 1024;
const BITS_PER_BYTE = 8;
const SLOW_4G = {
	offline: false,
	latency: 150,
	downloadThroughput: (1.6 * KBIT * KBIT) / BITS_PER_BYTE,
	uploadThroughput: (750 * KBIT) / BITS_PER_BYTE,
};
const CPU_SLOWDOWN = 4;
const CONTENT_TIMEOUT = 120000;
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.woff2': 'font/woff2',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(DIST, 'index.html'))) {
	console.error(`[perf-throttle] ${DIST}/index.html not found`);
	process.exit(1);
}

const server = createServer((req, res) => {
	const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
	let file = join(DIST, path);
	if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
		file = join(DIST, 'index.html'); // SPA fallback
	}
	const body = readFileSync(file);
	const type = MIME[extname(file)] ?? 'application/octet-stream';
	const compressible = /^(text|application\/(json|manifest))|javascript|svg/.test(type);
	const headers = { 'content-type': type, 'cache-control': 'no-store' };
	if (compressible) {
		res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
		res.end(gzipSync(body, { level: 6 }));
	} else {
		res.writeHead(200, headers);
		res.end(body);
	}
});
await new Promise((ok) => server.listen(PORT, ok));

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function oneRun(browser) {
	const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
	let bytes = 0;
	cdp.on('Network.loadingFinished', (e) => {
		bytes += e.encodedDataLength;
	});
	await page.addInitScript(() => {
		window.__perf = { fcp: 0, lcp: 0 };
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.name === 'first-contentful-paint') window.__perf.fcp = entry.startTime;
			}
		}).observe({ type: 'paint', buffered: true });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	});
	const start = Date.now();
	await page.goto(`http://localhost:${PORT}/c/${CODE}`, { waitUntil: 'commit' });
	// ready = the splash is gone and either the lesson or the "unknown code" card shows
	await page.waitForFunction(
		() =>
			document.querySelector('.login__card, .frame, .hub') !== null &&
			document.querySelector('.boot-splash') === null,
		null,
		{ timeout: CONTENT_TIMEOUT },
	);
	const contentReady = Date.now() - start;
	const perf = await page.evaluate(() => window.__perf);
	await context.close();

	return { fcp: perf.fcp, lcp: perf.lcp, contentReady, kb: bytes / 1000 };
}

const browser = await chromium.launch();
const runs = [];
try {
	for (let i = 0; i < RUNS; i += 1) {
		const run = await oneRun(browser);
		runs.push(run);
		console.info(
			`[perf-throttle] run ${i + 1}: FCP ${run.fcp.toFixed(0)} ms, LCP ${run.lcp.toFixed(0)} ms, contentReady ${run.contentReady} ms, ${run.kb.toFixed(0)} kB`,
		);
	}
} finally {
	await browser.close();
	server.close();
}
console.info(
	`[perf-throttle] MEDIAN of ${RUNS} (slow 4G, CPU x${CPU_SLOWDOWN}, cold cache): ` +
		`FCP ${median(runs.map((r) => r.fcp)).toFixed(0)} ms, LCP ${median(runs.map((r) => r.lcp)).toFixed(0)} ms, ` +
		`contentReady ${median(runs.map((r) => r.contentReady))} ms, transferred ${median(runs.map((r) => r.kb)).toFixed(0)} kB`,
);
