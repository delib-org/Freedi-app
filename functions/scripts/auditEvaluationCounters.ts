/**
 * READ-ONLY audit: does every option's `evaluation.numberOfEvaluators` equal the
 * number of evaluation documents that point at it?
 *
 * Every evaluation document is a participant (zeros included), so any gap is a
 * counter that drifted — typically pulled down by neutral votes after an hourly
 * drift correction or an admin "Recalculate" that only counted non-zero ones.
 * Nothing is written.
 *
 * Usage:
 * FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/auditEvaluationCounters.ts <questionStatementId>
 *
 * Or against a real project (reads only):
 * FIREBASE_PROJECT_ID=<project> npx tsx scripts/auditEvaluationCounters.ts <questionStatementId>
 * GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json npx tsx scripts/auditEvaluationCounters.ts <id>
 */

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import type { Evaluation, Statement } from '@freedi/shared-types';

if (getApps().length === 0) {
	const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
	const projectId = process.env.FIREBASE_PROJECT_ID;
	if (serviceAccountPath) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const serviceAccount = require(serviceAccountPath);
		initializeApp({ credential: cert(serviceAccount) });
	} else if (projectId) {
		initializeApp({ credential: applicationDefault(), projectId });
	} else if (process.env.FIRESTORE_EMULATOR_HOST) {
		initializeApp({ projectId: 'demo-test' });
	} else {
		console.error(
			'No credentials provided. Set GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID, or FIRESTORE_EMULATOR_HOST',
		);
		process.exit(1);
	}
}

const db = getFirestore();
const EVAL_PAGE_SIZE = 500;
const TEXT_PREVIEW = 40;

interface GapRow {
	statementId: string;
	text: string;
	stored: number;
	docs: number;
	zeros: number;
	gap: number;
}

async function countEvaluationDocs(questionId: string): Promise<{
	docsByStatement: Map<string, number>;
	zerosByStatement: Map<string, number>;
	total: number;
}> {
	const docsByStatement = new Map<string, number>();
	const zerosByStatement = new Map<string, number>();
	let total = 0;
	let cursor: QueryDocumentSnapshot | null = null;

	for (;;) {
		let pageQuery = db
			.collection(Collections.evaluations)
			.where('parentId', '==', questionId)
			.orderBy('evaluatorId')
			.limit(EVAL_PAGE_SIZE);
		if (cursor) pageQuery = pageQuery.startAfter(cursor);
		const page = await pageQuery.get();
		if (page.empty) break;

		page.forEach((doc) => {
			const evaluation = doc.data() as Evaluation;
			if (!evaluation.statementId) return;
			docsByStatement.set(
				evaluation.statementId,
				(docsByStatement.get(evaluation.statementId) ?? 0) + 1,
			);
			if (evaluation.evaluation === 0) {
				zerosByStatement.set(
					evaluation.statementId,
					(zerosByStatement.get(evaluation.statementId) ?? 0) + 1,
				);
			}
		});
		total += page.size;

		if (page.size < EVAL_PAGE_SIZE) break;
		cursor = page.docs[page.docs.length - 1];
	}

	return { docsByStatement, zerosByStatement, total };
}

async function audit(questionId: string): Promise<void> {
	const optionsSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();
	const { docsByStatement, zerosByStatement, total } = await countEvaluationDocs(questionId);

	console.info(`Question ${questionId}: ${optionsSnapshot.size} options, ${total} evaluation docs`);

	const gaps: GapRow[] = [];
	let storedTotal = 0;
	let docsTotal = 0;

	for (const doc of optionsSnapshot.docs) {
		const statement = doc.data() as Statement;
		const stored = statement.evaluation?.numberOfEvaluators ?? 0;
		const docs = docsByStatement.get(doc.id) ?? 0;
		storedTotal += stored;
		docsTotal += docs;
		if (stored !== docs) {
			gaps.push({
				statementId: doc.id,
				text: (statement.statement ?? '').substring(0, TEXT_PREVIEW),
				stored,
				docs,
				zeros: zerosByStatement.get(doc.id) ?? 0,
				gap: docs - stored,
			});
		}
	}

	gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

	if (gaps.length > 0) {
		console.info(
			'\nstatementId'.padEnd(26) +
				'stored'.padStart(8) +
				'docs'.padStart(8) +
				'zeros'.padStart(8) +
				'gap'.padStart(8) +
				'  text',
		);
		for (const row of gaps) {
			console.info(
				row.statementId.padEnd(25) +
					String(row.stored).padStart(8) +
					String(row.docs).padStart(8) +
					String(row.zeros).padStart(8) +
					String(row.gap).padStart(8) +
					`  ${row.text}`,
			);
		}
	}

	const gapsExplainedByZeros = gaps.filter((g) => g.gap === g.zeros).length;
	console.info('\n========== SUMMARY ==========');
	console.info(`Options checked:          ${optionsSnapshot.size}`);
	console.info(`Options with a gap:       ${gaps.length}`);
	console.info(`  gap == their zero votes: ${gapsExplainedByZeros}`);
	console.info(`Sum of stored counters:   ${storedTotal}`);
	console.info(`Sum of evaluation docs:   ${docsTotal}`);
	console.info(`Total gap:                ${docsTotal - storedTotal}`);
}

const questionId = process.argv[2];

if (!questionId || questionId.startsWith('--')) {
	console.info('Usage: npx tsx scripts/auditEvaluationCounters.ts <questionStatementId>');
	process.exit(1);
}

audit(questionId)
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error('auditEvaluationCounters failed', {
			operation: 'scripts.auditEvaluationCounters',
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	});
