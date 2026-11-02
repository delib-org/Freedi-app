// Usage: node src/render-pdf-chromium.mjs <fixture.json> <out.pdf> [--local]
// --local uses CHROME_PATH (macOS Chrome) for layout checks; default uses @sparticuz/chromium (Linux only).
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildHtml } from './html.mjs';

const [, , fixturePath, outPath, flag] = process.argv;
const t0 = performance.now();
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));

// Lazy imports, to time each dependency's cold-load separately.
const tImp0 = performance.now();
const puppeteer = (await import('puppeteer-core')).default;
const tPptr = performance.now() - tImp0;
let executablePath, args, tChromiumImport = 0, tChromiumUnpack = 0;
if (flag === '--local') {
	executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	args = ['--no-sandbox'];
} else {
	const a = performance.now();
	const chromium = (await import('@sparticuz/chromium')).default;
	tChromiumImport = performance.now() - a;
	const b = performance.now();
	executablePath = await chromium.executablePath(); // unpacks brotli bundle into /tmp on first call
	tChromiumUnpack = performance.now() - b;
	args = chromium.args;
}
const html = buildHtml(fx);
const tLaunch0 = performance.now();
const browser = await puppeteer.launch({ executablePath, args, headless: 'shell' });
const tLaunch = performance.now() - tLaunch0;
const page = await browser.newPage();
const tRender0 = performance.now();
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
const tRender = performance.now() - tRender0;
await browser.close();
writeFileSync(outPath, pdf);
console.info(JSON.stringify({
	out: outPath, bytes: pdf.length, htmlBytes: html.length,
	ms: { puppeteerImport: Math.round(tPptr), chromiumImport: Math.round(tChromiumImport), chromiumUnpack: Math.round(tChromiumUnpack), launch: Math.round(tLaunch), setContentAndPdf: Math.round(tRender), total: Math.round(performance.now() - t0) },
	rssMB: Math.round(process.memoryUsage().rss / 1048576),
}));
