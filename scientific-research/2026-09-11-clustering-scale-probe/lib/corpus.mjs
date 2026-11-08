// Pol.is comments.csv → eligible items with opaque ids. Pure; no network.
import { makeOpaqueIds, seededShuffle } from './rng.mjs';

/** RFC 4180 CSV parser (quoted fields, doubled quotes, embedded newlines). */
export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (c !== '\r') field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	const header = rows.shift();

	return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export const normaliseText = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const cleanText = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Eligibility: moderated === "1" (approved by the conversation's moderators),
 * non-empty, first occurrence of each normalised text. author-id is dropped.
 * Ids are assigned in a seeded shuffle of comment order, so neither the id nor
 * the file position carries information about the item.
 */
export function buildBankAll(rows, { idSeed }) {
	const excluded = { moderatedNotApproved: 0, empty: 0, exactDuplicate: 0 };
	const seen = new Set();
	const kept = [];
	const byCommentId = [...rows].sort((a, b) => Number(a['comment-id']) - Number(b['comment-id']));
	for (const r of byCommentId) {
		if (r.moderated !== '1') {
			excluded.moderatedNotApproved++;
			continue;
		}
		const text = cleanText(r['comment-body'] ?? '');
		if (!text) {
			excluded.empty++;
			continue;
		}
		const key = normaliseText(text);
		if (seen.has(key)) {
			excluded.exactDuplicate++;
			continue;
		}
		seen.add(key);
		kept.push({ sourceCommentId: Number(r['comment-id']), text });
	}
	const shuffled = seededShuffle(kept, idSeed);
	const ids = makeOpaqueIds(shuffled.length, idSeed ^ 0x5bd1e995);
	const items = shuffled.map((item, i) => ({ id: ids[i], ...item, chars: item.text.length }));
	items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

	return { items, excluded, sourceRows: rows.length };
}
