// Perf gate for the student entry of WizCol Class (IA section 9b, device budget).
// Run after `npm run build`, from apps/join-class:  npm run perf:gate
//
// Asserts, on dist/:
//   1. the student entry (index JS + every module the HTML preloads + entry CSS
//      + the default-locale chunk) stays within BUDGET_GZIP_BYTES gzipped;
//   2. only one font family is declared in the built CSS;
//   3. no `autoplay` attribute anywhere in src/ or dist/ (HTML/JS/CSS/TS).
// Exits 1 with a readable message on any violation.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');

const BYTES_PER_KB = 1000;
/** The product target (IA section 9b): first screen <= 300 kB gzipped. */
export const TARGET_GZIP_BYTES = 300 * BYTES_PER_KB;
/**
 * RATCHET, not the target. Measured 2026-10-22 after deleting Join's leftover
 * screens (Main, Invite, Solutions, Chat, FacilitatorPanel and their libs):
 * 267.8 kB gzipped (329.4 kB before; firebase chunk 172.5 kB is the bulk, the
 * entry went from 124.3 to 81.8 kB). Set to the measured value + 2 % so any
 * growth fails. Lower it again whenever the entry shrinks.
 */
export const BUDGET_GZIP_BYTES = 273200;
/** Locale whose chunk counts as "the default locale chunk" (Hebrew first). */
const DEFAULT_LOCALE = process.env.PERF_GATE_LOCALE ?? 'he';
const ALLOWED_FONT_FAMILIES = 1;

const failures = [];

function gzipSize(file) {
	return gzipSync(readFileSync(file), { level: 9 }).length;
}

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}

	return out;
}

if (!existsSync(join(DIST, 'index.html'))) {
	console.error('[perf-gate] dist/index.html not found. Run `npm run build` first.');
	process.exit(1);
}

// ---- 1. entry weight ----------------------------------------------------------
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const hrefs = new Set();
for (const match of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) hrefs.add(match[1]);
for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) hrefs.add(match[1]);
for (const match of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) hrefs.add(match[1]);
const localeMap = /var C=(\{[^}]*\})/.exec(html);
if (localeMap) {
	const locales = JSON.parse(localeMap[1]);
	if (locales[DEFAULT_LOCALE]) hrefs.add(locales[DEFAULT_LOCALE]);
	else failures.push(`default locale "${DEFAULT_LOCALE}" chunk not found in the boot script`);
} else {
	failures.push('locale chunk map not found in dist/index.html (vite-plugin-locale-preload changed?)');
}

const entryFiles = [...hrefs].filter((href) => href.startsWith('/assets/'));
let totalGzip = 0;
const rows = entryFiles.map((href) => {
	const gz = gzipSize(join(DIST, href));
	totalGzip += gz;

	return { href, gz };
});
console.info('[perf-gate] student entry (gzip -9):');
for (const row of rows.sort((a, b) => b.gz - a.gz)) {
	console.info(`  ${(row.gz / BYTES_PER_KB).toFixed(1).padStart(7)} kB  ${row.href}`);
}
console.info(
	`[perf-gate] total ${(totalGzip / BYTES_PER_KB).toFixed(1)} kB / budget ${(BUDGET_GZIP_BYTES / BYTES_PER_KB).toFixed(1)} kB (target ${(TARGET_GZIP_BYTES / BYTES_PER_KB).toFixed(0)} kB)`,
);
if (totalGzip > BUDGET_GZIP_BYTES) {
	failures.push(
		`student entry is ${totalGzip} bytes gzipped, over the budget of ${BUDGET_GZIP_BYTES}`,
	);
}

// ---- 2. one font family -------------------------------------------------------
const families = new Set();
for (const file of walk(join(DIST, 'assets')).filter((f) => f.endsWith('.css'))) {
	const css = readFileSync(file, 'utf8');
	for (const face of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
		const family = /font-family:\s*["']?([^;"'}]+)["']?/.exec(face[1]);
		if (family) families.add(family[1].trim());
	}
}
console.info(`[perf-gate] font families in dist: ${[...families].join(', ') || '(none)'}`);
if (families.size > ALLOWED_FONT_FAMILIES) {
	failures.push(`more than ${ALLOWED_FONT_FAMILIES} font family in dist: ${[...families].join(', ')}`);
}

// ---- 3. no autoplay -----------------------------------------------------------
const AUTOPLAY = /autoplay/i;
const scanned = [
	...walk(SRC).filter((f) => /\.(ts|scss|css|html)$/.test(f) && !f.includes('__tests__')),
	...walk(DIST).filter((f) => /\.(js|css|html)$/.test(f) && !/(sw|workbox[^/]*)\.js$/.test(f)),
];
for (const file of scanned) {
	// the project's own code and what it ships; vendor chunks are checked for the
	// attribute form only, since libraries mention the word in feature detection
	const text = readFileSync(file, 'utf8');
	const isVendor = /dist\/assets\/(firebase|browser|sentryClient)-/.test(file);
	const hit = isVendor ? /\sautoplay[\s=>]/i.test(text) : AUTOPLAY.test(text);
	if (hit) failures.push(`"autoplay" found in ${relative(ROOT, file)}`);
}
console.info(`[perf-gate] autoplay scan over ${scanned.length} files`);

if (failures.length > 0) {
	for (const failure of failures) console.error(`[perf-gate] FAIL: ${failure}`);
	process.exit(1);
}
console.info('[perf-gate] PASS');
