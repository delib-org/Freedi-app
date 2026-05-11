import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { getFirestore } from 'firebase-admin/firestore';
import { detectLanguage } from './language';
import type { RawResponse } from './types';

/**
 * Build the text we'll cluster on. Per spec: paragraphs joined by space, falling
 * back to the `statement` (title) field. The legacy `paragraphs[]` array is used
 * when populated; otherwise the title is the cluster signal.
 */
export function buildText(statement: Statement): string {
	const paragraphs = statement.paragraphs;
	if (paragraphs && paragraphs.length > 0) {
		const joined = paragraphs
			.map((p) => p.content?.trim() ?? '')
			.filter(Boolean)
			.join(' ')
			.trim();
		if (joined.length > 0) return joined;
	}

	return (statement.statement ?? '').trim();
}

/**
 * Filter that decides which direct children of a parent question count as
 * "responses" we should cluster. Excludes:
 * - hidden statements
 * - existing cluster Statements (isCluster=true) created by other pipelines
 * - paragraph child-statements (rich-body fragments, not response options)
 * - prior synthetics from THIS pipeline (those get rebuilt per the idempotency
 *   contract and would otherwise pollute the input)
 */
function isResponseCandidate(s: Statement): boolean {
	if (s.hide === true) return false;
	if (s.isCluster === true) return false;
	if (s.statementType === StatementType.paragraph) return false;
	if (s.derivedByPipeline === 'topic-cluster') return false;

	return true;
}

/**
 * Load a parent question and all its direct response children from Firestore.
 * Detects per-response language. Does NOT split into pools — that's filter.ts.
 */
export async function loadParentAndChildren(parentId: string): Promise<{
	parent: Statement;
	responses: RawResponse[];
}> {
	const db = getFirestore();

	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	if (!parentDoc.exists) {
		throw new Error(`Parent statement ${parentId} not found`);
	}
	const parent = parentDoc.data() as Statement;

	const childrenSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.get();

	const responses: RawResponse[] = [];
	for (const doc of childrenSnap.docs) {
		const s = doc.data() as Statement;
		if (!isResponseCandidate(s)) continue;
		const text = buildText(s);
		if (!text) continue;
		responses.push({
			statementId: s.statementId,
			statement: s,
			text,
			language: detectLanguage(text),
			totalEvaluators: s.evaluation?.numberOfEvaluators ?? 0,
			lastUpdate: s.lastUpdate ?? 0,
		});
	}

	return { parent, responses };
}

/**
 * Offline mode: load a parent + responses from a JSON export file. Skips
 * Firestore entirely. The export shape is `{ parent: Statement, responses:
 * Statement[] }` (we'll document this in RECLUSTER.md).
 */
export async function loadFromFile(path: string): Promise<{
	parent: Statement;
	responses: RawResponse[];
}> {
	const { readFile } = await import('node:fs/promises');
	const raw = await readFile(path, 'utf-8');
	const json = JSON.parse(raw) as { parent: Statement; responses: Statement[] };
	const responses: RawResponse[] = [];
	for (const s of json.responses) {
		if (!isResponseCandidate(s)) continue;
		const text = buildText(s);
		if (!text) continue;
		responses.push({
			statementId: s.statementId,
			statement: s,
			text,
			language: detectLanguage(text),
			totalEvaluators: s.evaluation?.numberOfEvaluators ?? 0,
			lastUpdate: s.lastUpdate ?? 0,
		});
	}

	return { parent: json.parent, responses };
}
