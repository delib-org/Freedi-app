#!/usr/bin/env node
/**
 * Offline quality gate for the admin "Re-theme with AI" batch rebuild.
 *
 * Replays a saved end state through the COMPILED, unmodified production
 * rebuild (`functions/lib/.../synthesis/themeRebuild`): atoms are built with
 * `toRebuildAtom` (visible syntheses + plain options in no synthesis, the same
 * contract as `collectAtoms`), then `discoverThemes` + `assignAtoms` run with
 * the real models. Syntheses are copied through untouched; only the theme layer
 * (topicClusters) is replaced, so `score100.mjs` scores the rebuild directly.
 *
 * Input modes
 *   --run=<runDir>    a live-synth-accuracy run (results.json + statements.json).
 *                     Writes <out>/live (the saved state, copied) and
 *                     <out>/rebuild (the rebuilt theme layer), both scoreable.
 *   --state=<json>    a generic {question, atoms:[{id,title,kind,memberIds}]}
 *                     state (Bq). Writes <out>/rebuild.json (themes + Other).
 *
 *   usage: node rebuild.mjs (--run=<dir> | --state=<file>) --out=<dir>
 *   env:   OPENAI_API_KEY via functions/.env of this worktree
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const LIB = resolve(REPO, 'functions/lib/functions/src');
const require = createRequire(import.meta.url);

const arg = (name) => {
	const a = process.argv.find((x) => x.startsWith(`--${name}=`));

	return a ? a.slice(name.length + 3) : undefined;
};
const RUN = arg('run');
const STATE = arg('state');
const OUT = resolve(arg('out') ?? '.');

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

const openaiChat = require(join(LIB, 'config/openai-chat.js'));
const { discoverThemes } = require(join(LIB, 'synthesis/themeRebuild/discoverThemes.js'));
const { assignAtoms } = require(join(LIB, 'synthesis/themeRebuild/assignAtoms.js'));
const { toRebuildAtom } = require(join(LIB, 'synthesis/themeRebuild/collectAtoms.js'));
const { NONE_KEY } = require(join(LIB, 'synthesis/themeRebuild/constants.js'));

/* ---------------- token accounting (wraps the shared client) ---------------- */

const PRICE = {
	'gpt-5.6-terra': { in: 2.0, out: 12.0 },
	'gpt-5.6-luna': { in: 0.2, out: 1.2 },
};
const usage = {};
const client = openaiChat.getOpenAI();
const create = client.chat.completions.create.bind(client.chat.completions);
client.chat.completions.create = async (body, opts) => {
	const res = await create(body, opts);
	const u = (usage[body.model] ??= { calls: 0, prompt: 0, completion: 0 });
	u.calls++;
	u.prompt += res.usage?.prompt_tokens ?? 0;
	u.completion += res.usage?.completion_tokens ?? 0;

	return res;
};
function costOf(u) {
	let usd = 0;
	for (const [model, x] of Object.entries(u)) {
		const p = PRICE[model];
		if (p) usd += (x.prompt * p.in + x.completion * p.out) / 1e6;
	}

	return usd;
}

/* ---------------- atoms ---------------- */

const memberId = (m) => (typeof m === 'string' ? m : m.id);

function atomsFromRun(dir) {
	const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
	const stmts = JSON.parse(readFileSync(join(dir, 'statements.json'), 'utf8'));
	const synths = results.synths.items.filter((s) => !s.hidden);
	const inSynth = new Set(synths.flatMap((s) => s.members.map(memberId)));
	const docs = [
		...synths.map((s) => ({
			statementId: s.id,
			statement: s.title,
			description: s.description,
			integratedOptions: s.members.map(memberId),
			derivedByPipeline: 'synthesis',
		})),
		...stmts.statements
			.filter((r) => !inSynth.has(r.id))
			.map((r) => ({ statementId: r.id, statement: r.text })),
	];

	return { question: stmts.question, atoms: docs.map(toRebuildAtom), results };
}

function atomsFromState(file) {
	const state = JSON.parse(readFileSync(file, 'utf8'));
	const docs = state.atoms.map((a) => ({
		statementId: a.id,
		statement: a.title,
		...(a.kind === 'synth' ? { integratedOptions: a.memberIds, derivedByPipeline: 'synthesis' } : {}),
	}));

	return { question: state.question, atoms: docs.map(toRebuildAtom), state };
}

/* ---------------- rebuild ---------------- */

async function rebuild(question, atoms) {
	const t0 = Date.now();
	const themes = await discoverThemes(question, atoms);
	const { assignments, unanswered } = await assignAtoms(question, themes, atoms);
	const withMembers = themes
		.map((t) => ({ ...t, memberIds: atoms.filter((a) => assignments.get(a.id) === t.key).map((a) => a.id) }))
		.filter((t) => t.memberIds.length > 0);
	const otherIds = atoms.filter((a) => assignments.get(a.id) === NONE_KEY).map((a) => a.id);

	return { themes: withMembers, discovered: themes.length, otherIds, unanswered, ms: Date.now() - t0 };
}

async function main() {
	mkdirSync(OUT, { recursive: true });
	const input = RUN ? atomsFromRun(resolve(RUN)) : atomsFromState(resolve(STATE));
	const out = await rebuild(input.question, input.atoms);
	const isSynth = new Map(input.atoms.map((a) => [a.id, a.isSynth]));
	const log = {
		input: RUN ?? 'state',
		atoms: input.atoms.length,
		synthAtoms: input.atoms.filter((a) => a.isSynth).length,
		discovered: out.discovered,
		themesWithMembers: out.themes.length,
		otherCount: out.otherIds.length,
		unanswered: out.unanswered,
		sizes: out.themes.map((t) => t.memberIds.length).sort((a, b) => b - a),
		ms: out.ms,
		usage,
		usd: costOf(usage),
	};

	if (RUN) {
		const src = resolve(RUN);
		for (const tag of ['live', 'rebuild']) mkdirSync(join(OUT, tag), { recursive: true });
		copyFileSync(join(src, 'statements.json'), join(OUT, 'live/statements.json'));
		copyFileSync(join(src, 'results.json'), join(OUT, 'live/results.json'));
		copyFileSync(join(src, 'statements.json'), join(OUT, 'rebuild/statements.json'));
		const results = {
			...input.results,
			topicClusters: {
				items: out.themes.map((t) => ({
					id: t.key,
					title: t.name,
					description: t.rule,
					members: t.memberIds.filter((id) => !isSynth.get(id)).map((id) => ({ id })),
					memberSynthIds: t.memberIds.filter((id) => isSynth.get(id)),
					derivedByPipeline: 'topic-cluster',
					hidden: false,
				})),
			},
		};
		writeFileSync(join(OUT, 'rebuild/results.json'), JSON.stringify(results, null, 1));
		log.themes = out.themes.map((t) => ({ key: t.key, name: t.name, rule: t.rule, size: t.memberIds.length }));
	} else {
		writeFileSync(join(OUT, 'rebuild.json'), JSON.stringify(out, null, 1));
	}
	writeFileSync(join(OUT, 'rebuild-log.json'), JSON.stringify(log, null, 1));
	console.error(
		`${RUN ?? STATE}: ${log.themesWithMembers} themes (${log.discovered} discovered), other ${log.otherCount}, $${log.usd.toFixed(4)}`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
