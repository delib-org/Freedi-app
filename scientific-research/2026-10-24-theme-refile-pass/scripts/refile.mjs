#!/usr/bin/env node
/**
 * Offline: does a periodic "re-file everything" pass fix what filing-at-arrival
 * got wrong?
 *
 * Today an idea is filed under a theme ONCE, when it arrives (`assignToTheme`
 * from runSinglePipeline). The reJudge cron splits oversized themes and merges
 * duplicates, but never moves a misfiled idea and never re-offers an unthemed
 * one. This measures the missing pass.
 *
 * THE PASS. Freeze the theme list (titles, descriptions, contents). Offer EVERY
 * atom — a synthesis or a standalone statement, themed or not — to the COMPILED
 * production judge against that frozen snapshot. The atom's own entry is left
 * out of its current theme's contents, so the judge is not shown the answer.
 * Calls are independent and decisions are applied together at the end, so the
 * order atoms are visited in cannot change the result. Emptied themes vanish.
 * Repeat on the new state until nothing moves (max --passes).
 *
 * TWO POLICIES from the same judge answers (no extra calls):
 *   keep  — a themed atom the judge answers NONE for stays where it is (custody)
 *   evict — a themed atom the judge answers NONE for becomes unthemed
 * Both: a different theme → move; an unthemed atom → filed when a theme fits.
 *
 * Input modes
 *   --run=<runDir>    a live-synth-accuracy run's end state (results.json +
 *                     statements.json); writes per-pass results.json copies so
 *                     the official score100.mjs scores them.
 *   --state=<json>    a generic {question, atoms, themes} state (Bq).
 *
 *   usage: node refile.mjs (--run=<dir> | --state=<file>) --out=<dir> [--passes=3]
 *   env:   OPENAI_API_KEY via functions/.env
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const require = createRequire(import.meta.url);

const arg = (name, dflt) => {
	const a = process.argv.find((x) => x.startsWith(`--${name}=`));

	return a ? a.slice(name.length + 3) : dflt;
};
const RUN = arg('run');
const STATE = arg('state');
const OUT = resolve(arg('out', '.'));
const PASSES = Number(arg('passes', '3'));
const CONCURRENCY = 8;

for (const line of readFileSync(resolve(REPO, 'functions/.env'), 'utf8').split('\n')) {
	const t = line.trim();
	if (!t || t.startsWith('#')) continue;
	const i = t.indexOf('=');
	if (i === -1) continue;
	const k = t.slice(0, i).trim();
	let v = t.slice(i + 1).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
	if (!(k in process.env)) process.env[k] = v;
}
const compiled = require(resolve(REPO, 'functions/lib/functions/src/services/integration-ai-service.js'));

/* ---------------- state ---------------- */

/** state = { question, atoms: [{id, title, description?}], themes: [{id, title, description?, atomIds}] } */
function stateFromRun(dir) {
	const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
	const stmts = JSON.parse(readFileSync(join(dir, 'statements.json'), 'utf8'));
	const synths = results.synths.items.filter((s) => !s.hidden);
	const inSynth = new Set(synths.flatMap((s) => s.members.map((m) => (typeof m === 'string' ? m : m.id))));
	const atoms = [
		...synths.map((s) => ({ id: s.id, title: s.title, description: s.description, kind: 'synth' })),
		...stmts.statements.filter((r) => !inSynth.has(r.id)).map((r) => ({ id: r.id, title: r.text, kind: 'option' })),
	];
	const known = new Set(atoms.map((a) => a.id));
	const owned = new Set();
	const themes = results.topicClusters.items
		.filter((t) => !t.hidden)
		.map((t) => ({
			id: t.id,
			title: t.title,
			description: t.description,
			// one owner per atom: first visible theme wins, as the scorer's reading does
			atomIds: [...(t.memberSynthIds ?? []), ...(t.members ?? []).map((m) => (typeof m === 'string' ? m : m.id))]
				.filter((id) => known.has(id) && !owned.has(id) && owned.add(id)),
		}))
		.filter((t) => t.atomIds.length > 0);

	return { question: stmts.question, atoms, themes, results };
}

function themeOf(state) {
	const m = new Map();
	for (const t of state.themes) for (const a of t.atomIds) m.set(a, t.id);

	return m;
}

/* ---------------- judge ---------------- */

const CACHE_FILE = join(OUT, 'judge-cache.jsonl');
const cache = new Map();

function loadCache() {
	if (!existsSync(CACHE_FILE)) return;
	for (const line of readFileSync(CACHE_FILE, 'utf8').split('\n')) {
		if (line.trim()) {
			const r = JSON.parse(line);
			cache.set(r.key, r.value);
		}
	}
}

async function judge(state, atom) {
	const titleOf = new Map(state.atoms.map((a) => [a.id, a.title]));
	const themes = state.themes.map((t) => ({
		id: t.id,
		title: t.title,
		description: t.description,
		// leave-one-out: the atom is not shown inside its own current theme
		contents: t.atomIds.filter((id) => id !== atom.id).map((id) => titleOf.get(id)).filter(Boolean),
	}));
	const input = {
		proposalTitle: atom.title,
		proposalDescription: atom.description,
		themes,
		questionContext: state.question,
	};
	const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
	if (cache.has(key)) return cache.get(key);
	const res = await compiled.assignToTheme(input);
	const value = { themeId: res.themeId ?? null, reason: res.reason };
	cache.set(key, value);
	appendFileSync(CACHE_FILE, `${JSON.stringify({ key, value })}\n`);

	return value;
}

async function pool(items, fn) {
	const out = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]);
			}
		}),
	);

	return out;
}

/* ---------------- one pass ---------------- */

function apply(state, decisions, policy) {
	const before = themeOf(state);
	const after = new Map(before);
	let moved = 0, filed = 0, evicted = 0;
	for (const { atomId, themeId } of decisions) {
		const cur = before.get(atomId) ?? null;
		if (themeId && themeId !== cur) {
			after.set(atomId, themeId);
			cur ? moved++ : filed++;
		} else if (!themeId && cur && policy === 'evict') {
			after.delete(atomId);
			evicted++;
		}
	}
	const themes = state.themes
		.map((t) => ({ ...t, atomIds: state.atoms.map((a) => a.id).filter((id) => after.get(id) === t.id) }))
		.filter((t) => t.atomIds.length > 0);

	return { state: { ...state, themes }, moved, filed, evicted, themesEmptied: state.themes.length - themes.length };
}

function summary(state) {
	const sizes = state.themes.map((t) => t.atomIds.length).sort((a, b) => b - a);
	const themed = sizes.reduce((s, x) => s + x, 0);

	return { themes: sizes.length, sizes, unthemedAtoms: state.atoms.length - themed, atoms: state.atoms.length };
}

/* ---------------- run mode: write a scoreable results.json ---------------- */

function writeRun(srcDir, state, tag) {
	const dir = join(OUT, tag);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'statements.json'), readFileSync(join(srcDir, 'statements.json')));
	const kind = new Map(state.atoms.map((a) => [a.id, a.kind]));
	const results = {
		...state.results,
		topicClusters: {
			items: state.themes.map((t) => ({
				id: t.id,
				title: t.title,
				description: t.description,
				members: t.atomIds.filter((id) => kind.get(id) === 'option').map((id) => ({ id })),
				memberSynthIds: t.atomIds.filter((id) => kind.get(id) === 'synth'),
				derivedByPipeline: 'topic-cluster',
				hidden: false,
			})),
		},
	};
	writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 1));

	return dir;
}

/* ---------------- main ---------------- */

async function main() {
	mkdirSync(OUT, { recursive: true });
	loadCache();
	const start = RUN ? stateFromRun(resolve(RUN)) : JSON.parse(readFileSync(resolve(STATE), 'utf8'));
	const log = { input: RUN ?? basename(STATE), passes: [], start: summary(start) };
	if (RUN) writeRun(resolve(RUN), start, 'pass0');

	let state = start;
	for (let p = 1; p <= PASSES; p++) {
		const answers = await pool(state.atoms, (a) => judge(state, a));
		const decisions = state.atoms.map((a, i) => ({ atomId: a.id, themeId: answers[i].themeId }));
		const keep = apply(state, decisions, 'keep');
		const entry = {
			pass: p,
			calls: state.atoms.length,
			keep: { moved: keep.moved, filed: keep.filed, themesEmptied: keep.themesEmptied, ...summary(keep.state) },
		};
		if (p === 1) {
			const evict = apply(state, decisions, 'evict');
			entry.evict = { moved: evict.moved, filed: evict.filed, evicted: evict.evicted, ...summary(evict.state) };
			if (RUN) writeRun(resolve(RUN), evict.state, 'pass1-evict');
			if (!RUN) writeFileSync(join(OUT, 'pass1-evict.state.json'), JSON.stringify(evict.state));
		}
		entry.moves = decisions
			.filter((d) => d.themeId && d.themeId !== themeOf(state).get(d.atomId))
			.map((d) => ({ atomId: d.atomId, from: themeOf(state).get(d.atomId) ?? null, to: d.themeId }));
		log.passes.push(entry);
		state = keep.state;
		if (RUN) writeRun(resolve(RUN), state, `pass${p}-keep`);
		else writeFileSync(join(OUT, `pass${p}-keep.state.json`), JSON.stringify(state));
		console.error(`pass ${p}: moved ${keep.moved}, filed ${keep.filed}, themes ${summary(state).themes}`);
		if (keep.moved + keep.filed === 0) break;
	}
	writeFileSync(join(OUT, 'refile-log.json'), JSON.stringify(log, null, 1));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
