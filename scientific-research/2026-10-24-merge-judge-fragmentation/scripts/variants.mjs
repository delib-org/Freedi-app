/**
 * Merge-judge variants under test. Each returns an async function
 * ({themes, questionContext, results, state}) => groups[{ids, title}].
 *
 *   baseline  the shipped `groupEquivalentThemes` (headings only, whole set, one call)
 *   fold      small headings are filed under a larger one by the production FILING
 *             judge (`assignToTheme`), which sees what each heading holds and is
 *             biased to NONE when unsure. One call per small heading.
 *   shipped   the productionised small-verify: needs scripts/candidate-fix.patch applied and
 *             functions built, then --lib=worktree. NOT in the repo.
 *   small     the baseline call with each heading's idea count shown and a rule that
 *             a one-or-two-idea heading is a premature narrow heading to absorb into a
 *             broader one (never two established headings into each other)
 *   small-vote  `small`, asked 3 times with the headings in different orders; a pair
 *             merges only when 2 of 3 calls put it together
 *   small-verify  `small-vote`, then every absorbed heading is checked by a second call
 *             that sees both headings' ideas and must say the ideas fit under the survivor
 */

const SMALL_MAX_ATOMS = Number(process.env.SMALL_MAX_ATOMS ?? 2);
const CONTENTS_SHOWN = 4;
const VOTES = 3;

function shuffled(list, seed) {
	const out = [...list];
	let x = seed * 2654435761;
	for (let i = out.length - 1; i > 0; i--) {
		x = (x * 1103515245 + 12345) % 2147483648;
		const j = x % (i + 1);
		[out[i], out[j]] = [out[j], out[i]];
	}

	return out;
}

async function verifyAbsorb(gemini, donor, survivor, questionContext) {
	const list = (t) => t.contents.slice(0, CONTENTS_SHOWN).map((c) => `     - ${c}`).join('\n');
	const prompt = `A community consultation has these two topic headings.

QUESTION: "${questionContext}"

SMALL TOPIC: ${donor.title}${donor.description ? ` - ${donor.description}` : ''}
  its ideas:
${list(donor)}

BROADER TOPIC: ${survivor.title}${survivor.description ? ` - ${survivor.description}` : ''}  (${survivor.contents.length} ideas)
  some of its ideas:
${list(survivor)}

Would a participant browsing the BROADER TOPIC reasonably expect to find the SMALL
TOPIC's ideas there? Say yes only when those ideas address the same area of
concern as the broader topic's ideas (even through different actions). Sharing
the question's subject, or merely both being about the city, is not enough.

Return JSON: { "fits": true or false }`;
	const model = gemini.getGenAI().getGenerativeModel({
		model: gemini.LLM_MODEL_FAST,
		generationConfig: { responseMimeType: 'application/json', temperature: 0 },
	});
	const result = await model.generateContent(prompt);
	const parsed = JSON.parse(result.response.text().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());

	return parsed.fits === true;
}

async function smallPrompt(gemini, themes, questionContext) {
	const lines = themes
		.map((t, i) => `${i + 1}. [${t.id}] ${t.title}${t.description ? ` — ${t.description}` : ''} (${t.atoms} idea${t.atoms === 1 ? '' : 's'})`)
		.join('\n');
	const prompt = `You are tidying the topic headings of a community consultation.

QUESTION: "${questionContext}"

CURRENT TOPICS (with how many ideas each holds):
${lines}

These headings grew one at a time as ideas arrived, so some are narrower than
they should be and several may name the same area of concern.

TASK: Find groups of topics that should be ONE topic, and give each group a
heading that covers it.

A topic holding only one or two ideas is almost always a heading that was
created because the first idea to arrive had nowhere to go. If a broader topic
covers the same area of life or domain of city activity, absorb the small one
into it. Do NOT group two well-populated topics with each other, do NOT group
topics merely because both are about the city, and never give a merged group a
heading that restates or paraphrases the question. Leave a topic out of every
group when it genuinely stands alone. Returning no groups at all is a valid answer.

Return JSON:
{
  "groups": [
    { "ids": ["id1", "id2"], "title": "3-6 word heading for the merged topic" }
  ]
}`;
	const model = gemini.getGenAI().getGenerativeModel({
		model: gemini.LLM_MODEL_FAST,
		generationConfig: { responseMimeType: 'application/json', temperature: 0 },
	});
	const result = await model.generateContent(prompt);
	const parsed = JSON.parse(result.response.text().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
	const known = new Set(themes.map((t) => t.id));
	const claimed = new Set();
	const groups = [];
	for (const raw of Array.isArray(parsed.groups) ? parsed.groups : []) {
		const ids = (raw?.ids ?? []).filter((id) => typeof id === 'string' && known.has(id) && !claimed.has(id));
		if (ids.length < 2) continue;
		ids.forEach((id) => claimed.add(id));
		groups.push({ ids, title: String(raw.title ?? '').trim() });
	}

	return groups;
}

function atomTitles(state) {
	const m = new Map();
	for (const s of state.results.synths.items) m.set(s.id, s.title);
	for (const s of state.stmts.statements) m.set(s.id, s.text);

	return m;
}

function themeAtoms(t) {
	return [...(t.memberSynthIds ?? []), ...(t.members ?? []).map((x) => (typeof x === 'string' ? x : x.id))];
}

export function judgeFor(variant, service, gemini, planner) {
	if (variant === 'shipped') {
		// The code under test: the compiled planner from this branch, with its real prompts.
		return async ({ questionContext, results, state }) => {
			const titles = atomTitles(state);
			const live = results.topicClusters.items.filter((t) => !t.hidden && themeAtoms(t).length > 0);
			const byId = new Map(live.map((t) => [t.id, t]));
			const themes = live.map((t) => ({ id: t.id, title: t.title, description: t.description, ideaCount: themeAtoms(t).length }));

			return planner.planThemeMerges(themes, questionContext, {
				propose: service.groupEquivalentThemes,
				verifyAbsorption: service.verifyThemeAbsorption,
				loadContents: async (id) => themeAtoms(byId.get(id)).map((a) => titles.get(a) ?? a).slice(0, CONTENTS_SHOWN),
			});
		};
	}
	if (variant === 'baseline') {
		return async ({ themes, questionContext }) => service.groupEquivalentThemes({ themes, questionContext });
	}
	if (variant === 'fold') {
		return async ({ questionContext, results, state }) => {
			const titles = atomTitles(state);
			const live = results.topicClusters.items.filter((t) => !t.hidden && themeAtoms(t).length > 0);
			const info = (t) => ({
				id: t.id,
				title: t.title,
				description: t.description,
				contents: themeAtoms(t).map((a) => titles.get(a) ?? a),
				atoms: themeAtoms(t).length,
			});
			const all = live.map(info);
			const small = all.filter((t) => t.atoms <= SMALL_MAX_ATOMS).sort((a, b) => a.atoms - b.atoms);
			const target = new Map(); // small id -> large id
			for (const s of small) {
				const others = all.filter((t) => t.id !== s.id && t.atoms > SMALL_MAX_ATOMS);
				if (others.length === 0) continue;
				const res = await service.assignToTheme({
					proposalTitle: s.title,
					proposalDescription: [s.description, ...s.contents.slice(0, CONTENTS_SHOWN)].filter(Boolean).join('\n'),
					themes: others.map(({ id, title, description, contents }) => ({ id, title, description, contents })),
					questionContext,
				});
				if (res.themeId) target.set(s.id, res.themeId);
			}
			const byTarget = new Map();
			for (const [sid, tid] of target) byTarget.set(tid, [...(byTarget.get(tid) ?? []), sid]);

			return [...byTarget].map(([tid, sids]) => ({ ids: [tid, ...sids], title: all.find((t) => t.id === tid).title }));
		};
	}
	if (variant === 'small' || variant === 'small-vote' || variant === 'small-verify') {
		const votes = variant === 'small' ? 1 : VOTES;

		return async ({ questionContext, results, state }) => {
			const titles = atomTitles(state);
			const live = results.topicClusters.items
				.filter((t) => !t.hidden && themeAtoms(t).length > 0)
				.map((t) => ({ id: t.id, title: t.title, description: t.description, atoms: themeAtoms(t).length, contents: themeAtoms(t).map((a) => titles.get(a) ?? a) }));
			const tally = new Map();
			const titleOf = new Map(live.map((t) => [t.id, t.title]));
			for (let v = 0; v < votes; v++) {
				const order = v === 0 ? live : shuffled(live, v);
				const groups = await smallPrompt(gemini, order, questionContext);
				const seen = new Set();
				for (const g of groups) {
					for (let i = 0; i < g.ids.length; i++) {
						for (let j = i + 1; j < g.ids.length; j++) {
							const key = [g.ids[i], g.ids[j]].sort().join('|');
							if (!seen.has(key)) {
								seen.add(key);
								tally.set(key, (tally.get(key) ?? 0) + 1);
							}
						}
					}
				}
			}
			const need = votes === 1 ? 1 : 2;
			const parent = new Map();
			const find = (x) => (parent.get(x) === undefined || parent.get(x) === x ? x : find(parent.get(x)));
			for (const [key, n] of tally) {
				if (n < need) continue;
				const [a, b] = key.split('|');
				parent.set(find(a), find(b));
			}
			const comps = new Map();
			for (const t of live) {
				const r = find(t.id);
				comps.set(r, [...(comps.get(r) ?? []), t.id]);
			}

			const grouped = [...comps.values()]
				.filter((ids) => ids.length > 1)
				.filter((ids) => ids.filter((id) => live.find((t) => t.id === id).atoms > SMALL_MAX_ATOMS).length <= 1)
				.map((ids) => ids.sort((a, b) => live.find((t) => t.id === b).atoms - live.find((t) => t.id === a).atoms));
			if (variant !== 'small-verify') return grouped.map((ids) => ({ ids, title: titleOf.get(ids[0]) }));
			const kept = [];
			for (const ids of grouped) {
				const survivor = live.find((t) => t.id === ids[0]);
				const ok = [ids[0]];
				for (const id of ids.slice(1)) {
					if (await verifyAbsorb(gemini, live.find((t) => t.id === id), survivor, questionContext)) ok.push(id);
				}
				if (ok.length > 1) kept.push({ ids: ok, title: titleOf.get(ids[0]) });
			}

			return kept;
		};
	}
	throw new Error(`unknown variant ${variant}`);
}
