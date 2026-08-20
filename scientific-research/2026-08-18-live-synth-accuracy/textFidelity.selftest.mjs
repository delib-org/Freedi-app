/**
 * Verify the text-fidelity judge against merges whose answer is known.
 *
 * This exists for one reason. A judge that answers "preserved" to everything
 * reports a perfect score on a pipeline that has destroyed half its input, and
 * the failure is invisible: it produces a number, not an error, and the number
 * is good news. That is precisely the shape of the two measurement bugs this
 * study already shipped and had to correct (RESULTS.md Finding 8) — a
 * measurement that fails silently in the direction of looking plausible. So the
 * instrument is checked against damage it MUST catch and against fidelity it
 * must NOT cry wolf over, before any run is scored with it.
 *
 * Fixtures are hand-written, not drawn from the corpus, so a judge that has
 * merely memorised the benchmark cannot pass.
 *
 *   node textFidelity.selftest.mjs
 */
import { buildPrompt, judge, loadEnv, JUDGE_MODEL } from './textFidelity.mjs';

loadEnv();

const QUESTION = "What should our city do to improve residents' quality of life?";

const CASES = [
	{
		name: 'faithful merge of two true paraphrases',
		members: [
			'Add protected bike lanes on the main avenues.',
			'Build separated cycling lanes along major roads.',
		],
		title: 'Build Protected Bike Lanes on Major Roads',
		description:
			'Install physically separated cycling lanes along the city’s main avenues and major roads.',
		// One faithful sentence covers both; neither may be marked damaged.
		expect: { verdicts: ['preserved', 'preserved'], fabricated: false },
	},
	{
		name: 'one member dropped entirely',
		members: [
			'Open primary-care clinics in underserved neighborhoods.',
			'Provide free dental care for children under 12.',
		],
		title: 'Open Neighborhood Primary-Care Clinics',
		description:
			'Open primary-care clinics in neighborhoods that currently have no local provider.',
		// The dental ask is nowhere in the published text.
		expect: { verdicts: ['preserved', 'lost'], fabricated: false },
	},
	{
		name: 'both asks generalised into a heading',
		members: [
			'Run buses every 10 minutes on route 5 after 8pm.',
			'Extend the night bus on route 12 until 2am.',
		],
		title: 'Improve Public Transportation',
		description: 'The city should make public transport better for everyone.',
		// Nothing concrete survives: no route, no frequency, no hour.
		expect: { verdicts: ['weakened', 'weakened'], fabricated: false, allowLost: true },
	},
	{
		name: 'faithful merge that also invents a funding mechanism',
		members: [
			'Plant more trees along residential streets.',
			'Add shade trees on neighborhood sidewalks.',
		],
		title: 'Plant Shade Trees on Residential Streets',
		description:
			'Plant shade trees along residential sidewalks, funded by a new 2% levy on commercial property owners.',
		// Members are carried; the levy is invented.
		expect: { verdicts: ['preserved', 'preserved'], fabricated: true },
	},
	{
		name: 'title-only merge that still carries both',
		members: [
			'Put all municipal forms online.',
			'Let residents complete city paperwork on the web.',
		],
		title: 'Move All Municipal Forms and Paperwork Online',
		description: '',
		// Body absent — the title alone must still be judged on its merits.
		expect: { verdicts: ['preserved', 'preserved'], fabricated: false },
	},
];

const norm = (v) => (['preserved', 'weakened', 'lost'].includes(v) ? v : 'weakened');

let failures = 0;
console.log(`judge: ${JUDGE_MODEL}\n`);

for (const c of CASES) {
	const result = await judge(
		buildPrompt({
			question: QUESTION,
			members: c.members,
			title: c.title,
			description: c.description,
		}),
	);
	const got = (result.verdicts ?? [])
		.slice()
		.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
		.map((v) => norm(v.verdict));

	const verdictOk = c.expect.verdicts.every((want, i) => {
		if (got[i] === want) return true;
		// "generalised away" and "gone" are the same finding for our purposes;
		// the distinction between them is not what this fixture is testing.
		if (c.expect.allowLost && want === 'weakened' && got[i] === 'lost') return true;

		return false;
	});
	const lengthOk = got.length === c.expect.verdicts.length;
	const fabricationOk = Boolean(result.fabricated) === c.expect.fabricated;
	const pass = verdictOk && lengthOk && fabricationOk;
	if (!pass) failures++;

	console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}`);
	console.log(`      expected ${c.expect.verdicts.join(', ')} | fabricated=${c.expect.fabricated}`);
	console.log(`      got      ${got.join(', ')} | fabricated=${Boolean(result.fabricated)}`);
	if (!pass) {
		for (const v of result.verdicts ?? []) console.log(`        #${v.index}: ${v.why}`);
		if (result.fabricationDetail) console.log(`        fabrication: ${result.fabricationDetail}`);
	}
	console.log();
}

if (failures > 0) {
	console.log(`${failures}/${CASES.length} fixtures failed — do NOT score a run with this judge.`);
	process.exit(1);
}
console.log(`all ${CASES.length} fixtures correct — the judge detects loss, generalisation and`);
console.log('fabrication, and does not cry wolf on a genuinely faithful merge.');
