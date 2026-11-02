#!/usr/bin/env node
/**
 * Offline counterfactual: run the COMPILED production rebuild (discoverThemes +
 * assignAtoms) on a saved Korazim snapshot. Nothing is written to Firestore.
 *   Arm R: shipped prompts, untouched.
 *   Arm F: same mechanics; the prompt strings are swapped IN THIS PROCESS ONLY
 *          for a facilitator framing. Production code and deployed prompts are
 *          not changed. Written AFTER seeing Sigal's result, so hypothesis-generating.
 * usage: node replay.mjs --raw=<dir> --q=<id> --arm=R|F --n=<repeat>
 * Output goes to <raw>/replay/ (outside the repo): holds statement ids and AI names.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const LIB = resolve(REPO, 'functions/lib/functions/src');
const require = createRequire(import.meta.url);
const arg = (n) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3);
const RAW = arg('raw'), Q = arg('q'), ARM = arg('arm'), N = arg('n');

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
const prompts = require(join(LIB, 'synthesis/themeRebuild/prompts.js'));
const { discoverThemes } = require(join(LIB, 'synthesis/themeRebuild/discoverThemes.js'));
const { assignAtoms } = require(join(LIB, 'synthesis/themeRebuild/assignAtoms.js'));
const { toRebuildAtom } = require(join(LIB, 'synthesis/themeRebuild/collectAtoms.js'));
const { NONE_KEY } = require(join(LIB, 'synthesis/themeRebuild/constants.js'));

const FACILITATOR = `You are an experienced facilitator of participatory community processes.
Residents answered one question. Sort their answers the way the residents themselves would
talk about them: by the broad fields of life they think in, not by the actor, lever or
mechanism a proposal relies on. Different actions, actors and tools that serve the same
field of life belong together, and a field may be large. Do not split a field just because
it is big. Do not restate the question as a field. A proposal that fits no field is left out.`;

if (ARM === 'F') {
	const shippedDiscovery = prompts.discoveryUserPrompt;
	prompts.DISCOVERY_SYSTEM = `${FACILITATOR}\nReturn only JSON.`;
	prompts.ASSIGN_SYSTEM = `${FACILITATOR}\nYou now file proposals under a fixed list of fields.\nReturn only JSON.`;
	prompts.discoveryUserPrompt = (question, texts, bounds) =>
		`${shippedDiscovery(question, texts, bounds)}

NAMING: each "name" is a short phrase of 2-4 words, in the plain words residents or their
village would use. Name one field: no lists, no commas, no "X and Y". Propose as few fields
as the answers truly need; the upper limit above is a limit, not a target.`;
} else if (ARM !== 'R') throw new Error('arm');

const PRICE = { 'gpt-5.6-terra': { in: 2, out: 12 }, 'gpt-5.6-luna': { in: 0.2, out: 1.2 } };
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

const D = JSON.parse(readFileSync(join(RAW, `lineage-${Q}.json`), 'utf8'));
const S = D.statements;
const QUESTION = { 'IqKVla0ZHw-m': 'מה אנחנו רוצים לשמר בכורזים?', 'WfkDISMmbduQ': 'מה אנו רוצים לשפר בכורזים?' }[Q];
const syn = S.filter((s) => s.derivedByPipeline === 'synthesis' && !s.hide);
const inSyn = new Set(syn.flatMap((s) => s.integratedOptions ?? []));
const docs = [...syn, ...S.filter((s) => !s.derivedByPipeline && !s.hide && !inSyn.has(s.statementId))];
const atoms = docs.map(toRebuildAtom);

const themes = await discoverThemes(QUESTION, atoms);
const { assignments, unanswered } = await assignAtoms(QUESTION, themes, atoms);
const out = {
	arm: ARM,
	atoms: atoms.length,
	discovered: themes.length,
	themes: themes.map((t) => ({ ...t, memberIds: atoms.filter((a) => assignments.get(a.id) === t.key).map((a) => a.id) })).filter((t) => t.memberIds.length),
	otherIds: atoms.filter((a) => assignments.get(a.id) === NONE_KEY).map((a) => a.id),
	unanswered,
	usage,
	usd: Object.entries(usage).reduce((s, [m, x]) => s + (x.prompt * (PRICE[m]?.in ?? 0) + x.completion * (PRICE[m]?.out ?? 0)) / 1e6, 0),
};
mkdirSync(join(RAW, 'replay'), { recursive: true });
writeFileSync(join(RAW, 'replay', `${Q}-${ARM}${N}.json`), JSON.stringify(out, null, 1));
console.info(Q, ARM, N, 'themes', out.themes.length, 'other', out.otherIds.length, 'usd', out.usd.toFixed(4));
process.exit(0);
