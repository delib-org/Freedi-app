// Writes annotation/labels.provisional.jsonl and annotation/query-selection.jsonl
// from the in-session reading of annotation/shortlists.md by Claude (claude-opus-5),
// 2026-09-11. PROVISIONAL: model-authored, not human ground truth. No judge-model
// (gpt-5.6-luna) output existed when these were written.
import { writeJsonl } from '../lib/util.mjs';

const SOURCE = 'provisional:claude-opus-5 in-session reading of screening shortlists (not human ground truth)';
const h = (id, why, borderline = false) => (borderline ? { id, why, borderline: true } : { id, why });

const labels = [
	// ---------------- dev (smoke only)
	{ rank: 1, queryId: 'p5yca', split: 'dev', status: 'none', matches: [], hardDistractors: [
		h('pj74t', 'goal (more accessible WKU parking), not the Chestnut St structure'),
		h('p89sh', 'generic "build parking areas" — no place, no structure'),
		h('p8zq7', 'garage behind Spencer’s downtown — different site, adds green roof'),
		h('pk47i', 'repair the existing downtown garage'),
		h('pd3p9', 'better parking around the square, not WKU'),
		h('pq3ad', 'more downtown parking / release reserved spaces'),
		h('ph8pr', 'residential permits near WKU — restricts parking'),
		h('p5at5', 'retain downtown parking for businesses')] },
	{ rank: 2, queryId: 'pptbv', split: 'dev', status: 'none', matches: [], hardDistractors: [
		h('p3cst', 'mixed use city-wide; query limits it to the most disadvantaged areas', true),
		h('padkd', 'urban planning for mixed use in general'),
		h('pjrdt', 'banks and groceries (not mixed-use development) in low-income areas'),
		h('pc7zk', 'spread city resources to low-income areas — no development type'),
		h('prqiv', 'more resources to the north-northeast ends'),
		h('pgaj7', 'home-improvement grants in older areas'),
		h('pbm45', 'renovate existing housing'),
		h('p6u6a', 'cross-sector cooperation on housing equality')] },
	{ rank: 23, queryId: 'pxjks', split: 'dev', status: 'match', matches: ['ppwgk'], note: 'shielded street lamps = dark-sky-compliant fixtures', hardDistractors: [
		h('p5hnk', 'require MORE street lights on residential streets'),
		h('pm8t7', 'regulate business sign brightness, not street lights'),
		h('pu42c', 'road reflectors and signage'),
		h('pxg44', 'beautification, bury utilities'),
		h('p87p6', 'carbon-neutral city'),
		h('pwbe8', 'solar incentives')] },
	{ rank: 25, queryId: 'pk7ki', split: 'dev', status: 'match', matches: ['ps9dt'], hardDistractors: [
		h('pnfi5', 'traffic cameras as the specific means (plus revenue)', true),
		h('pav4r', 'more officers at intersections — a staffing means'),
		h('pu33h', 'expired-tag enforcement only'),
		h('ptaiy', 'red-light complaint, no action'),
		h('pqr9z', 'parking enforcement during events'),
		h('pqhex', 'parking enforcement / separate traffic division'),
		h('pc7ap', 'install traffic cameras at intersections'),
		h('pek8y', 'stop-sign exhortation to drivers')] },
	// ---------------- test, no match anywhere in the bank
	{ rank: 4, queryId: 'p8jmp', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('pge2a', 'stronger church–state separation without the tax on politicking churches', true),
		h('pr9y5', 'revise the fairness ordinance for religious conscience'),
		h('p92xj', 'pass a fairness ordinance'),
		h('pkkkz', 'sanctuary-city right'),
		h('p9622', 'county taxes for city residents'),
		h('pahwq', 'marijuana tax revenue')] },
	{ rank: 5, queryId: 'pppcy', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('pw6rb', 'goal (no hungry child, officials responsible) without the school summer program', true),
		h('pdcp3', 'local produce in school lunchrooms'),
		h('pek7k', 'food assistance for college students'),
		h('pr4k5', 'food sustainability / insecurity city-wide'),
		h('p9v2v', 'special-diet school lunches'),
		h('pki7f', 'access to affordable local food'),
		h('p6kxg', 'remove sugary breakfast items'),
		h('pfin8', 'keep funding after-school care')] },
	{ rank: 6, queryId: 'p68um', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('pgrkj', 'INDOOR year-round pools'),
		h('p9ztq', 'year-round adult swim facility at Lovers Lane'),
		h('pjk6d', 'complaint about indoor pool fees'),
		h('p7438', 'riverfront canoe/kayak features'),
		h('pe6hw', 'kayak trail to the river'),
		h('pwsqv', 'swim lessons for K-12'),
		h('pkb9k', 'indoor/outdoor sports complex'),
		h('pkcbm', 'summer weekend festivals')] },
	{ rank: 7, queryId: 'ptcr8', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('pe9wi', 'youth programs in general (volunteering, labs), not mentorship', true),
		h('pwnap', 'invest in the youth — no action'),
		h('p5ryp', 'after-school activity centers'),
		h('pcq7d', 'places for teenagers to go'),
		h('p6wtw', 'educate high schoolers on post-graduation options'),
		h('pptwk', 'WKU–city cooperation incl. internships'),
		h('ps5tz', 'technical education for non-graduates'),
		h('pt8p7', 'arts and sciences in the Housing Authority')] },
	{ rank: 12, queryId: 'pu3fh', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('pamph', 'family activities via a kids play arena, not a museum', true),
		h('pgcmd', 'science/history/art museums for everyone, not ages 1-6', true),
		h('ptzfk', 'toy-filled park'),
		h('pzxze', 'family activities downtown'),
		h('pgdik', 'more family-friendly activities'),
		h('pee6u', 'creative learning classes'),
		h('p5ehs', 'indoor youth soccer complex'),
		h('pe9wi', 'youth programs')] },
	{ rank: 13, queryId: 'pqeyn', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('phsyb', 'stop new housing areas generally, "especially" farmland', true),
		h('pg99d', 'local farms are an attraction — statement'),
		h('pgpz3', 'zoning to encourage small businesses and farms'),
		h('pnukd', 'historic preservation of buildings'),
		h('pmk7t', 'replant trees'),
		h('pqaaf', 'urban sprawl complaint'),
		h('pmjj8', 'community farming programs')] },
	{ rank: 14, queryId: 'pns2r', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('p3et2', 'relax HOA fencing rules for pets, not farm permits'),
		h('py2mw', 'keep my yard as I please'),
		h('pgxi5', 'plant flowers anywhere in my yard'),
		h('pgpz3', 'zoning to encourage farms'),
		h('pbx3e', 'zoning changes need neighbour consent'),
		h('pcare', 'no county leash law')] },
	{ rank: 15, queryId: 'pxn3z', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('p2a6v', 'sewer lines to new subdivisions'),
		h('p9md3', 'extend county water lines'),
		h('pv2a8', 'restore lawns after city projects'),
		h('p8tq3', 'too much road work downtown'),
		h('ptuye', 'infrastructure outgrown — no action'),
		h('pe3gy', 'no development approval before infrastructure')] },
	{ rank: 16, queryId: 'pugud', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('p2839', 'bike trails only, extended into surrounding areas', true),
		h('pcp9t', 'walking/nature trails inside sports parks only', true),
		h('p5ahf', 'bike LANES and resources'),
		h('puyc6', 'link existing bike paths'),
		h('pgj3y', 'sidewalks and bike routes on major roads'),
		h('pp8pk', 'make the Greenway continuous'),
		h('pz6eg', 'wider bike lanes'),
		h('pufe9', 'multi-use sidewalk width')] },
	{ rank: 18, queryId: 'pudtd', split: 'test', status: 'none', matches: [], hardDistractors: [
		h('paxtf', 'a fiber option — a specific technology, not speed as such', true),
		h('pchi2', 'county-wide coverage complaint', true),
		h('pkzf6', 'competitive internet RATES'),
		h('pn9cj', 'coverage throughout the county, unserved first'),
		h('p6fag', 'infrastructure in growing areas like Alvaton'),
		h('pztez', 'WRECC as a provider'),
		h('pbqbi', 'BGMU residential service'),
		h('pcv53', 'BGMU fiber as a utility')] },
	// ---------------- test, at least one allowable match
	{ rank: 26, queryId: 'ptgpf', split: 'test', status: 'match', matches: ['psnvi', 'pvdxd', 'pr2fm'], note: 'the justification clause does not change the proposal (legalise marijuana)', hardDistractors: [
		h('peq9z', 'MEDICAL only'),
		h('pemdb', 'city resolution for medical cannabis'),
		h('p95zh', 'decriminalise small amounts, not legalise'),
		h('pahwq', 'state-level only, warns against BG alone'),
		h('p9mdn', 'opposite: do not legalise'),
		h('pvndx', 'industrial hemp'),
		h('pqeea', 'most drugs free and government controlled')] },
	{ rank: 28, queryId: 'paak8', split: 'test', status: 'match', matches: ['pj2cj', 'pvng8', 'pfibi'], note: '6 cents per $100 = occupational tax 1.85%→1.91% to house homeless school families', hardDistractors: [
		h('pp5rm', 'goal: no homeless families, officials responsible — no funding mechanism'),
		h('pqy2d', 'government economic policy, not NGO — no tax'),
		h('pfzd6', 'penalise employers of homeless people'),
		h('pa9ks', 'temporary housing for the homeless in general'),
		h('pihfx', 'curtail homelessness, keep off streets'),
		h('pwzum', 'replace Room at the Inn with temporary housing'),
		h('pvzzx', 'studio apartments, not tiny homes'),
		h('p6j9p', 'menu of homeless aid')] },
	{ rank: 32, queryId: 'pnyg7', split: 'test', status: 'match', matches: ['pptwk'], hardDistractors: [
		h('pgyhw', 'bring university resources (Kentucky Museum) to the community — one direction', true),
		h('pkta9', 'city and WKU on frat-house noise'),
		h('p67wb', 'WKU opens facilities to the public'),
		h('pz3q2', 'keep offering courses of interest'),
		h('pcvs4', 'grant for WKU grads to start businesses'),
		h('p3wgr', 'WKU psych + medical research collaboration'),
		h('pjrwf', 'purpose of higher education — statement')] },
	{ rank: 36, queryId: 'pc3m2', split: 'test', status: 'match', matches: ['pxjmb'], hardDistractors: [
		h('pgpz3', 'zoning changes (not incentives) for small businesses and farms', true),
		h('pcvs4', 'grant only for WKU graduates starting businesses'),
		h('pw6sg', 'fairer regulation, level playing field'),
		h('pfgep', 'limit Houchens’ growth'),
		h('panhj', 'want more businesses like White Squirrel'),
		h('psj6d', 'support local chefs and brewers'),
		h('p6r2s', 'lower taxes for small landlords')] },
	{ rank: 44, queryId: 'pyr2u', split: 'test', status: 'match', matches: ['pfwr5'], hardDistractors: [
		h('p9ujh', 'county lease laws like the city'),
		h('pd9yv', 'county noise ordinance like the city'),
		h('pahwq', 'marijuana legalisation at state level'),
		h('pm5k9', 'consolidate BG and Warren Co. into a metro'),
		h('peq9z', 'medical marijuana'),
		h('p9erh', 'annex areas into the city')] },
	{ rank: 47, queryId: 'pymzr', split: 'test', status: 'match', matches: ['pt458'], note: 'operating hours differ by 30 minutes — same intervention', hardDistractors: [
		h('pmiz7', 'Cave Mill peak-hour flow complaint, no signal'),
		h('p5ku8', 'stoplight at Shive Ln / Ken Bale Blvd'),
		h('pauwi', 'light at the Smokey Bones entrance'),
		h('pyei4', 'longer left-turn lights elsewhere'),
		h('p3bwu', 're-time stoplights at rush hour'),
		h('pbp7c', 'fewer traffic lights'),
		h('p572n', 'roundabout on Fairview')] },
	{ rank: 55, queryId: 'peqy9', split: 'test', status: 'match', matches: ['pbzyn'], hardDistractors: [
		h('pwin9', 'general public transit for non-drivers, not elderly/disabled', true),
		h('pts69', 'fund existing buses to expand service and accessibility', true),
		h('pi4wj', 'a real bus system'),
		h('pbaby', '24/7 transit for workers'),
		h('pmjk5', 'more creative transport options'),
		h('pdckg', 'affordable supports for the elderly'),
		h('p6864', 'EBT for grocery pickup'),
		h('pkupf', 'senior living community')] },
	{ rank: 64, queryId: 'pktbx', split: 'test', status: 'match', matches: ['pcv53', 'pbqbi'], note: 'BGMU is the municipal utility — municipal residential internet', hardDistractors: [
		h('pztez', 'rural electric CO-OP, not municipal'),
		h('pu2kb', 'bid for Google Fiber (private)'),
		h('pddku', 'regulate Spectrum’s rates'),
		h('p5rmi', 'more competition / private fiber'),
		h('paxtf', 'a fiber option — provider unspecified'),
		h('pkzf6', 'competitive rates'),
		h('puvmn', 'free public WiFi in some areas only')] },
	{ rank: 90, queryId: 'ptwgu', split: 'test', status: 'match', matches: ['pqnui'], note: 'pqnui adds immigrants; the refugee-integration proposal is shared', hardDistractors: [
		h('phdiq', 'welcome statement without an action', true),
		h('pqe94', 'refugees improve the community — statement'),
		h('pnv7k', 'immigrants have been a benefit — statement'),
		h('puqkg', 'one-year school classroom for immigrant students'),
		h('prnhy', 'require refugees to learn English'),
		h('pwg82', 'all immigrants should speak English'),
		h('pkkkz', 'sanctuary-city right')] },
	{ rank: 97, queryId: 'p6xjr', split: 'test', status: 'match', matches: ['pe3ap'], hardDistractors: [
		h('ph4wf', 'river area only (walk, park, restaurants, events), no downtown', true),
		h('pif8h', 'redevelop from WKU to the river, Greenville model', true),
		h('p7438', 'waterfront canoe/kayak features'),
		h('p4p8j', 'beautify the riverfront + walkability for young families'),
		h('pxra8', 'downtown pedestrian mall'),
		h('pv68d', 'retail not offices on Fountain Square'),
		h('p6jxh', 'Owensboro-style Friday night programs'),
		h('pzj5g', 'downtown art district')] },
];

const accepted = new Map(labels.map((l) => [l.rank, l]));
const R = {
	notProposal: 'rejected: not a proposal (statement, complaint, opinion)',
	vague: 'rejected: no identifiable action — equivalence undecidable',
	hedged: 'rejected: hedged/compound proposal ("such as", "possibly")',
	compound: 'rejected: compound list of several separate changes',
	noneFull: 'rejected: provisionally no-match and the no-match stratum was already full',
	core: (q) => `rejected: already labelled inside the core of accepted query ${q}`,
};
const rejected = {
	3: R.hedged, 8: R.vague, 9: R.notProposal, 10: R.vague, 11: R.vague, 17: R.vague, 19: R.noneFull, 20: R.noneFull,
	21: R.noneFull, 22: R.noneFull, 24: R.vague, 27: R.compound, 29: R.vague, 30: R.noneFull, 31: R.noneFull, 33: R.noneFull,
	34: R.noneFull, 35: R.noneFull, 37: R.core('pu3fh'), 38: R.noneFull, 39: R.notProposal, 40: R.noneFull, 41: R.core('pudtd'),
	42: R.noneFull, 43: R.noneFull, 45: R.noneFull, 46: R.notProposal, 48: R.core('pk7ki'), 49: R.noneFull, 50: R.core('pppcy'),
	51: R.noneFull, 52: R.noneFull, 53: R.noneFull, 54: R.notProposal, 56: R.noneFull, 57: R.noneFull, 58: R.notProposal,
	59: R.noneFull, 60: R.noneFull, 61: R.notProposal, 62: R.noneFull, 63: R.noneFull, 65: R.noneFull, 66: R.noneFull, 67: R.vague,
	68: R.core('pxjks'), 69: R.noneFull, 70: R.noneFull, 71: R.noneFull, 72: R.notProposal, 73: R.noneFull, 74: R.compound,
	75: R.notProposal, 76: R.noneFull, 77: R.notProposal, 78: R.core('ptgpf'), 79: R.core('p68um'), 80: R.notProposal,
	81: R.noneFull, 82: R.notProposal, 83: R.noneFull, 84: R.notProposal, 85: R.core('p68um'), 86: R.noneFull, 87: R.notProposal,
	88: R.noneFull, 89: R.vague, 91: R.noneFull, 92: R.noneFull, 93: R.core('p5yca'), 94: R.core('p5yca'), 95: R.core('paak8'), 96: R.noneFull,
};
const log = [];
for (let rank = 1; rank <= 97; rank++) {
	const l = accepted.get(rank);
	if (l) log.push({ candidateRank: rank, decision: 'accepted', queryId: l.queryId, split: l.split, status: l.status });
	else if (rejected[rank]) log.push({ candidateRank: rank, decision: rejected[rank] });
	else throw new Error(`no decision for candidate #${rank}`);
}

// Assign dev before test in seeded order within each stratum (rule fixed before annotation).
writeJsonl(new URL('./labels.provisional.jsonl', import.meta.url).pathname,
	labels.map(({ rank, ...l }) => ({ ...l, ambiguous: l.ambiguous ?? [], candidateRank: rank, labelSource: SOURCE })));
writeJsonl(new URL('./query-selection.jsonl', import.meta.url).pathname, log);
console.info(`labels ${labels.length}, selection log ${log.length}`);
