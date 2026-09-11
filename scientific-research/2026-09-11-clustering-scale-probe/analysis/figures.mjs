// Publication figures as hand-written SVG (vector) + PNG previews. Palette:
// dataviz reference categorical slots 1–2 (validated light: CVD ΔE 24.7,
// normal ΔE 33.6, both ≥ 3:1 on #fcfcfb). Every mark carries a <title> for
// native hover. Observations and projections are drawn and labelled apart.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ensureDir, median, writeFileAtomic } from '../lib/util.mjs';

const C = {
	surface: '#fcfcfb',
	text: '#0b0b0b',
	text2: '#52514e',
	muted: '#8a8983',
	grid: '#e6e5e0',
	A: '#2a78d6',
	B: '#eb6834',
};
const FONT = `font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif"`;
const LABEL = { A: 'A · full list', B: 'B · top-15 retrieval' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (x, d = 0) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function frame({ w, h, title, subtitle, note, body }) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT}>
<rect width="${w}" height="${h}" fill="${C.surface}"/>
<text x="24" y="30" font-size="16" font-weight="600" fill="${C.text}">${esc(title)}</text>
<text x="24" y="50" font-size="12" fill="${C.text2}">${esc(subtitle)}</text>
${body}
<text x="24" y="${h - 12}" font-size="10.5" fill="${C.muted}">${esc(note)}</text>
</svg>`;
}

/** Linear or log scale. */
const scale = (d0, d1, r0, r1, log = false) => (v) => {
	const t = log ? (Math.log10(v) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0)) : (v - d0) / (d1 - d0);

	return r0 + t * (r1 - r0);
};

function axes({ x0, x1, y0, y1, xTicks, yTicks, xs, ys, xLabel, yLabel, yFmt = (v) => fmt(v), xFmt = (v) => fmt(v) }) {
	let s = '';
	for (const t of yTicks) s += `<line x1="${x0}" x2="${x1}" y1="${ys(t)}" y2="${ys(t)}" stroke="${C.grid}" stroke-width="1"/><text x="${x0 - 8}" y="${ys(t) + 4}" font-size="11" fill="${C.text2}" text-anchor="end">${yFmt(t)}</text>`;
	for (const t of xTicks) s += `<text x="${xs(t)}" y="${y0 + 18}" font-size="11" fill="${C.text2}" text-anchor="middle">${xFmt(t)}</text>`;
	s += `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="${C.muted}" stroke-width="1"/>`;
	s += `<text x="${(x0 + x1) / 2}" y="${y0 + 38}" font-size="11.5" fill="${C.text2}" text-anchor="middle">${esc(xLabel)}</text>`;
	s += `<text transform="translate(${x0 - 52},${(y0 + y1) / 2}) rotate(-90)" font-size="11.5" fill="${C.text2}" text-anchor="middle">${esc(yLabel)}</text>`;

	return s;
}

function legend(x, y, items) {
	return items
		.map((it, i) => {
			const yy = y + i * 18;
			const mark = it.dash
				? `<line x1="${x}" x2="${x + 18}" y1="${yy}" y2="${yy}" stroke="${it.color}" stroke-width="2" stroke-dasharray="${it.dash}"/>`
				: `<circle cx="${x + 9}" cy="${yy}" r="4.5" fill="${it.color}" stroke="${C.surface}" stroke-width="2"/>`;

			return `${mark}<text x="${x + 26}" y="${yy + 4}" font-size="11.5" fill="${C.text}">${esc(it.label)}</text>`;
		})
		.join('');
}

const jitter = (i, n, width) => (n <= 1 ? 0 : ((i / (n - 1)) - 0.5) * width);

// ---------------------------------------------------------------- figures

function figTokens({ rows, sizes }) {
	const w = 760, h = 430, x0 = 90, x1 = 520, y0 = 350, y1 = 80;
	const maxY = Math.max(...rows.map((r) => r.promptTokens ?? 0));
	const top = Math.ceil(maxY / 2000) * 2000;
	const xs = scale(0, 520, x0, x1);
	const ys = scale(0, top, y0, y1);
	let body = axes({ x0, x1, y0, y1, xTicks: sizes, yTicks: Array.from({ length: top / 2000 + 1 }, (_, i) => i * 2000), xs, ys, xLabel: 'Existing proposals in the pool (N)', yLabel: 'Prompt tokens per judgement (provider usage)' });
	for (const m of ['A', 'B']) {
		const means = sizes.map((n) => {
			const c = rows.filter((r) => r.method === m && r.size === n);
			c.forEach((r, i) => {
				body += `<circle cx="${xs(n) + jitter(i, c.length, 18) + (m === 'A' ? -12 : 12)}" cy="${ys(r.promptTokens)}" r="2.2" fill="${C[m]}" fill-opacity="0.35"><title>${LABEL[m]} · ${r.callId}: ${r.promptTokens} prompt tokens</title></circle>`;
			});

			return [n, c.reduce((a, r) => a + r.promptTokens, 0) / c.length];
		});
		body += `<polyline points="${means.map(([n, v]) => `${xs(n)},${ys(v)}`).join(' ')}" fill="none" stroke="${C[m]}" stroke-width="2"/>`;
		for (const [n, v] of means) body += `<circle cx="${xs(n)}" cy="${ys(v)}" r="5" fill="${C[m]}" stroke="${C.surface}" stroke-width="2"><title>${LABEL[m]}, N=${n}: mean ${fmt(v)} prompt tokens</title></circle>`;
		const [ln, lv] = means.at(-1);
		body += `<text x="${xs(ln) + 40}" y="${ys(lv) + 4}" font-size="11.5" fill="${C.text}">${LABEL[m]} · ${fmt(lv)}</text>`;
	}
	body += legend(x0 + 10, y1 + 4, [{ color: C.A, label: LABEL.A }, { color: C.B, label: LABEL.B }]);

	return frame({ w, h, title: 'Input grows with the pool for A, stays flat for B', subtitle: 'Observed prompt tokens per judgement call; small dots = individual calls, large dots = means (20 queries × 2 orders)', note: 'Observed, gpt-5.6-luna, 11 Sep 2026. Same question, rubric, schema, output cap in A and B; only the candidate list differs.', body });
}

function figCostRatio({ summary, rows, sizes }) {
	const w = 780, h = 430, x0 = 90, x1 = 640, y0 = 350, y1 = 80;
	const pairsBy = new Map();
	for (const r of rows) {
		const k = `${r.queryId}|${r.size}|${r.orderIndex}`;
		if (!pairsBy.has(k)) pairsBy.set(k, {});
		pairsBy.get(k)[r.method] = r;
	}
	const ratios = sizes.map((n) => [...pairsBy.values()].filter((p) => p.A && p.B && p.A.size === n).map((p) => ({ v: p.A.undiscountedUsd / p.B.undiscountedUsd, id: `${p.A.queryId} o${p.A.orderIndex}` })));
	const top = Math.ceil(Math.max(...ratios.flat().map((r) => r.v), 3) / 2) * 2;
	const xs = (i) => x0 + ((i + 0.5) / sizes.length) * (x1 - x0);
	const ys = scale(0, top, y0, y1);
	const yTicks = Array.from({ length: top / 2 + 1 }, (_, i) => i * 2);
	let body = axes({ x0, x1, y0, y1, xTicks: [], yTicks, xs, ys, xLabel: 'Existing proposals in the pool (N)', yLabel: 'A cost ÷ B cost, same query and order', yFmt: (v) => `${v}×` });
	sizes.forEach((n, i) => (body += `<text x="${xs(i)}" y="${y0 + 18}" font-size="11" fill="${C.text2}" text-anchor="middle">${n}</text>`));
	body += `<line x1="${x0}" x2="${x1}" y1="${ys(2)}" y2="${ys(2)}" stroke="${C.text2}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${x1}" y="${ys(2) - 6}" font-size="11" fill="${C.text2}" text-anchor="end">pre-registered 2× threshold (at N = 500)</text>`;
	ratios.forEach((rs, i) => {
		rs.forEach((r, j) => (body += `<circle cx="${xs(i) + jitter(j, rs.length, 70)}" cy="${ys(r.v)}" r="3" fill="${C.A}" fill-opacity="0.55"><title>${r.id}, N=${sizes[i]}: ${r.v.toFixed(2)}×</title></circle>`));
		const m = median(rs.map((r) => r.v));
		body += `<line x1="${xs(i) - 48}" x2="${xs(i) + 48}" y1="${ys(m)}" y2="${ys(m)}" stroke="${C.text}" stroke-width="2.5"><title>median ${m.toFixed(2)}×</title></line><text x="${xs(i) + 54}" y="${ys(m) + 4}" font-size="11.5" font-weight="600" fill="${C.text}">${m.toFixed(1)}×</text>`;
	});

	return frame({ w, h, title: 'Paired cost ratio, full list (A) vs retrieval (B)', subtitle: 'One dot per query × order (40 per N); bar = median. Undiscounted list prices, so prompt caching cannot flatter either method', note: 'Observed per-judgement cost at a sampled pool state — not the cumulative cost of a discussion, and not the full Freedi pipeline.', body });
}

function figOutcomes({ summary, sizes }) {
	const w = 780, h = 500;
	const panels = [
		{ key: 'positive', title: 'Match-present queries — correct', field: 'correct', max: 20 },
		{ key: 'noMatch', title: 'No-match queries — correct', field: 'correct', max: 20 },
		{ key: 'positive', title: 'Match-present — false joins', field: 'falseJoin', max: 20 },
		{ key: 'noMatch', title: 'No-match — false joins', field: 'falseJoin', max: 20 },
	];
	let body = '';
	panels.forEach((p, i) => {
		const px = 70 + (i % 2) * 360, py = 120 + Math.floor(i / 2) * 170;
		const x0 = px, x1 = px + 250, y0 = py + 110, y1 = py + 10;
		const xs = scale(0, 520, x0, x1);
		const ys = scale(0, p.max, y0, y1);
		body += `<text x="${px}" y="${py - 4}" font-size="12" font-weight="600" fill="${C.text}">${esc(p.title)}</text>`;
		for (const t of [0, 10, 20]) body += `<line x1="${x0}" x2="${x1}" y1="${ys(t)}" y2="${ys(t)}" stroke="${C.grid}"/><text x="${x0 - 6}" y="${ys(t) + 4}" font-size="10.5" fill="${C.text2}" text-anchor="end">${t}</text>`;
		for (const n of sizes) body += `<text x="${xs(n)}" y="${y0 + 16}" font-size="10.5" fill="${C.text2}" text-anchor="middle">${n}</text>`;
		body += `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="${C.muted}"/>`;
		for (const m of ['A', 'B']) {
			const pts = sizes.map((n) => [n, summary.tables[p.key].find((r) => r.size === n && r.method === m)[p.field]]);
			const off = m === 'A' ? -4 : 4;
			body += `<polyline points="${pts.map(([n, v]) => `${xs(n) + off},${ys(v)}`).join(' ')}" fill="none" stroke="${C[m]}" stroke-width="2"/>`;
			for (const [n, v] of pts) body += `<circle cx="${xs(n) + off}" cy="${ys(v)}" r="4.5" fill="${C[m]}" stroke="${C.surface}" stroke-width="2"><title>${LABEL[m]}, N=${n}: ${v} of 20</title></circle>`;
			const [ln, lv] = pts.at(-1);
			body += `<text x="${xs(ln) + 16}" y="${ys(lv) + (m === 'A' ? -5 : 13)}" font-size="10.5" fill="${C.text}">${m} ${lv}</text>`;
		}
	});
	body += legend(24, 72, [{ color: C.A, label: LABEL.A }]) + legend(200, 72, [{ color: C.B, label: LABEL.B }]);

	return frame({ w, h, title: 'Decisions by pool size (20 cells per point: 10 queries × 2 orders)', subtitle: 'Observed counts, strict labels. Labels are PROVISIONAL (model-authored) until human adjudication.', note: 'x = existing proposals in the pool. Counts, not rates of an independent sample: 10 queries per panel, 2 orders each, one shared bank.', body });
}

function figRetrievalRank({ summary, sizes }) {
	const w = 680, h = 400, x0 = 90, x1 = 600, y0 = 320, y1 = 80;
	const maxRank = Math.max(16, ...summary.recall.flatMap((r) => r.bestRanks));
	const ys = scale(0, maxRank + 1, y0, y1);
	const xs = (i) => x0 + ((i + 0.5) / sizes.length) * (x1 - x0);
	const ticks = [1, 5, 10, 15].filter((t) => t <= maxRank + 1);
	let body = axes({ x0, x1, y0, y1, xTicks: [], yTicks: ticks, xs, ys, xLabel: 'Existing proposals in the pool (N)', yLabel: 'Cosine rank of best approved target' });
	sizes.forEach((n, i) => (body += `<text x="${xs(i)}" y="${y0 + 18}" font-size="11" fill="${C.text2}" text-anchor="middle">${n}</text>`));
	body += `<line x1="${x0}" x2="${x1}" y1="${ys(15.5)}" y2="${ys(15.5)}" stroke="${C.text2}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${x1}" y="${ys(15.5) - 6}" font-size="11" fill="${C.text2}" text-anchor="end">k = 15: below this line B shows the target</text>`;
	summary.recall.forEach((r, i) => {
		r.bestRanks.forEach((rank, j) => (body += `<circle cx="${xs(i) + jitter(j, r.bestRanks.length, 80)}" cy="${ys(rank)}" r="4" fill="${C.B}" stroke="${C.surface}" stroke-width="2"><title>N=${sizes[i]}: best approved target at rank ${rank} (cosine ${r.bestCosines[j]})</title></circle>`));
		body += `<text x="${xs(i)}" y="${y1 - 6}" font-size="11.5" fill="${C.text}" text-anchor="middle">${r.retrievedAtLeastOne}/${r.positiveQueries} retrieved</text>`;
	});

	return frame({ w, h, title: 'Where the approved target sits in B’s ranking', subtitle: 'One dot per match-present query; exact cosine, text-embedding-3-small, "Question: … Answer: …" text', note: 'Caveat: targets were found by screening that itself used embeddings (3-small, 3-large) and BM25, so this recall is optimistic.', body });
}

function figProjection({ summary, rows, study, fit }) {
	const w = 820, h = 450, x0 = 100, x1 = 560, y0 = 360, y1 = 80;
	const price = study.pricing.models['gpt-5.6-luna'];
	const xs = scale(100, 10000, x0, x1, true);
	const yMin = 1e-4, yMax = 1e-1;
	const ys = scale(yMin, yMax, y0, y1, true);
	let body = axes({ x0, x1, y0, y1, xTicks: [100, 200, 500, 1000, 2000, 5000, 10000], yTicks: [1e-4, 1e-3, 1e-2, 1e-1], xs, ys, xLabel: 'Existing proposals when the new one arrives (N, log scale)', yLabel: 'US$ per placement decision (log scale)', yFmt: (v) => `$${v >= 0.01 ? v.toFixed(2) : v.toFixed(4)}`, xFmt: (v) => fmt(v) });
	// Projection: marginal full-list arrival from the archived 100-item fit (dashed, neutral).
	const proj = [];
	for (let e = 2; e <= 4.0001; e += 0.05) {
		const N = 10 ** e;
		proj.push([N, ((fit.intercept + fit.slopePerPreviousStatement * N) * price.inputPerM + fit.outputPerArrival * price.outputPerM) / 1e6]);
	}
	body += `<polyline points="${proj.map(([n, v]) => `${xs(n)},${ys(v)}`).join(' ')}" fill="none" stroke="${C.muted}" stroke-width="2" stroke-dasharray="6 4"><title>Projection: archived L2 full-list fit, one arrival at state N (undiscounted)</title></polyline>`;
	const assumed = (2000 * price.inputPerM + 200 * price.outputPerM) / 1e6;
	body += `<line x1="${x0}" x2="${x1}" y1="${ys(assumed)}" y2="${ys(assumed)}" stroke="${C.text2}" stroke-width="1.5" stroke-dasharray="2 4"><title>Assumed complete-Freedi budget per arrival: $${assumed.toFixed(5)} (2,000 in / 200 out), NOT measured</title></line>`;
	body += `<text x="${x1 + 8}" y="${ys(assumed) + 4}" font-size="10.5" fill="${C.text2}">assumed Freedi budget</text><text x="${x1 + 8}" y="${ys(assumed) + 17}" font-size="10.5" fill="${C.text2}">(2,000/200 tokens — not measured)</text>`;
	const [pn, pv] = proj.at(-1);
	body += `<text x="${xs(pn) + 8}" y="${ys(pv) + 4}" font-size="10.5" fill="${C.muted}">historical full-list, projected</text>`;
	for (const m of ['A', 'B']) {
		const pts = [100, 200, 500].map((n) => {
			const c = rows.filter((r) => r.method === m && r.size === n);

			return [n, c.reduce((a, r) => a + r.undiscountedUsd, 0) / c.length];
		});
		body += `<polyline points="${pts.map(([n, v]) => `${xs(n)},${ys(v)}`).join(' ')}" fill="none" stroke="${C[m]}" stroke-width="2"/>`;
		for (const [n, v] of pts) body += `<circle cx="${xs(n)}" cy="${ys(v)}" r="5" fill="${C[m]}" stroke="${C.surface}" stroke-width="2"><title>Observed ${LABEL[m]}, N=${n}: mean $${v.toFixed(5)} per decision (undiscounted)</title></circle>`;
		const [ln, lv] = pts.at(-1);
		body += `<text x="${xs(ln) + 10}" y="${ys(lv) + (m === 'A' ? -6 : 14)}" font-size="11" fill="${C.text}">observed ${m}</text>`;
	}
	body += legend(x0 + 10, y1 + 2, [
		{ color: C.A, label: 'Observed A · full list (this probe)' },
		{ color: C.B, label: 'Observed B · top-15 retrieval (this probe)' },
		{ color: C.muted, label: 'Projection · archived 100-item full-list fit', dash: '6 4' },
		{ color: C.text2, label: 'Assumption · paper’s complete-Freedi budget', dash: '2 4' },
	]);

	return frame({ w, h, title: 'Per-decision cost: observations vs the manuscript’s projection', subtitle: 'Solid = measured here at N = 100/200/500. Dashed/dotted = projected or assumed. B is one component, not the Freedi pipeline.', note: 'Different prompt formats: the archived fit lists syntheses; this probe lists raw proposals with ids. Sampled states, not a streamed run.', body });
}

export async function buildFigures({ dir, summary, rows, study }) {
	const out = join(dir, 'figures');
	ensureDir(out);
	const sizes = study.sizes;
	const fitPath = join(dir, 'analysis', 'cost-fit-recomputed.json');
	const fit = existsSync(fitPath) ? JSON.parse((await import('node:fs')).readFileSync(fitPath, 'utf8')).fit : null;
	const figs = {
		'fig1-prompt-tokens': figTokens({ rows, sizes }),
		'fig2-paired-cost-ratio': figCostRatio({ summary, rows, sizes }),
		'fig3-decisions': figOutcomes({ summary, sizes }),
		'fig4-retrieval-rank': figRetrievalRank({ summary, sizes }),
	};
	if (fit) figs['fig5-cost-vs-projection'] = figProjection({ summary, rows, study, fit });
	for (const [name, svg] of Object.entries(figs)) writeFileAtomic(join(out, `${name}.svg`), svg);
	await renderPngs(out, Object.keys(figs));
}

async function renderPngs(out, names) {
	let chromium;
	try {
		const require = createRequire(join(out, '..', '..', '..', 'package.json'));
		({ chromium } = require('playwright'));
	} catch {
		console.info('playwright not resolvable — SVGs written, PNG previews skipped');

		return;
	}
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ deviceScaleFactor: 2 });
		for (const name of names) {
			const svg = (await import('node:fs')).readFileSync(join(out, `${name}.svg`), 'utf8');
			await page.setContent(`<html><body style="margin:0;background:#fcfcfb">${svg}</body></html>`);
			const el = await page.$('svg');
			await el.screenshot({ path: join(out, `${name}.png`) });
		}
	} finally {
		await browser.close();
	}
}
