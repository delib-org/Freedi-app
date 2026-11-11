import { logger } from 'firebase-functions';
import {
	Collections,
	getRandomUID,
	inheritedAccessScope,
	SourceApp,
	Statement,
	StatementType,
} from '@freedi/shared-types';
import { db } from './index';
import { generateDescriptionFromChildren } from './helpers';

/**
 * Splits a multi-line statement into title + paragraph children.
 * - First line becomes the parent's `statement` (title).
 * - Each remaining non-empty line becomes a child Statement with statementType 'paragraph'.
 * - A `description` (~200 chars) is auto-generated on the parent from the children.
 * - Skips if the statement text contains no newlines (single-line).
 */
export async function splitStatementIntoParagraphs(statement: Statement): Promise<void> {
	try {
		// Agora proposals are short free-text answers typed into a textarea during
		// a live lesson, and the game renders `statement` verbatim — it never reads
		// paragraph children. Splitting one would visibly delete every line after
		// the first from the student's screen moments after they submitted it.
		if (statement.sourceApp === SourceApp.AGORA) return;

		const text = statement.statement;

		// Only split if there are newlines
		if (!text.includes('\n')) return;

		const lines = text.split('\n');
		const title = lines[0].trim();
		const bodyLines = lines.slice(1).filter((line) => line.trim());

		// Nothing to split if no body lines
		if (bodyLines.length === 0) return;

		if (!title) {
			logger.warn(`Statement ${statement.statementId} has no title after split, skipping`);

			return;
		}

		const now = Date.now();
		const batch = db.batch();

		// Create child paragraph statements
		const childrenData: { statement: string; createdAt: number }[] = [];

		for (let i = 0; i < bodyLines.length; i++) {
			const lineText = bodyLines[i].trim();
			if (!lineText) continue;

			const childId = getRandomUID();
			const childCreatedAt = now + i; // preserves order

			const childStatement: Record<string, unknown> = {
				statementId: childId,
				statement: lineText,
				statementType: StatementType.paragraph,
				parentId: statement.statementId,
				topParentId: statement.topParentId,
				parents: [...(statement.parents || []), statement.statementId],
				...inheritedAccessScope(statement),
				creatorId: statement.creatorId,
				creator: statement.creator,
				createdAt: childCreatedAt,
				lastUpdate: childCreatedAt,
				consensus: 0,
			};

			const childRef = db.collection(Collections.statements).doc(childId);
			batch.set(childRef, childStatement);

			childrenData.push({ statement: lineText, createdAt: childCreatedAt });
		}

		// Generate description from children
		const description = generateDescriptionFromChildren(childrenData);

		// Update parent: set title to first line, add description
		const parentRef = db.collection(Collections.statements).doc(statement.statementId);
		batch.update(parentRef, {
			statement: title,
			description,
		});

		await batch.commit();

		logger.info(
			`Split statement ${statement.statementId} into title + ${childrenData.length} paragraph children`,
		);
	} catch (error) {
		logger.error(`Error splitting statement ${statement.statementId} into paragraphs:`, error);
		throw error;
	}
}
