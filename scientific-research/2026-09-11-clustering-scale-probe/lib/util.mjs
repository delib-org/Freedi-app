// Small side-effect-free helpers shared by the probe. Nothing here reads the
// environment or touches the network.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

export const sha256 = (bufOrString) => createHash('sha256').update(bufOrString).digest('hex');

export const sha256File = (path) => sha256(readFileSync(path));

/** 32-bit FNV-1a, used to derive per-cell seeds from stable strings. */
export function hash32(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}

	return h >>> 0;
}

export function ensureDir(path) {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

/** Write via a temp file + rename so a crash never leaves half a record. */
export function writeFileAtomic(path, content) {
	ensureDir(dirname(path));
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, content);
	renameSync(tmp, path);
}

export const writeJson = (path, value) => writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function readJsonl(path) {
	if (!existsSync(path)) return [];

	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
}

export const writeJsonl = (path, rows) =>
	writeFileAtomic(path, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));

export function appendJsonl(path, row) {
	ensureDir(dirname(path));
	appendFileSync(path, `${JSON.stringify(row)}\n`);
}

export const utf8Bytes = (s) => Buffer.byteLength(s, 'utf8');

export function median(xs) {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;

	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function quantile(xs, q) {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const pos = (s.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);

	return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseArgs(argv) {
	const out = { _: [] };
	for (const a of argv) {
		if (a.startsWith('--')) {
			const eq = a.indexOf('=');
			if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
			else out[a.slice(2)] = true;
		} else out._.push(a);
	}

	return out;
}
