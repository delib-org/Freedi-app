import { ParagraphType, Statement, StatementType } from '@freedi/shared-types';
import { createStatement } from './createStatement';
import { setStatementToDB } from './writeStatement';
import { generateParagraphId } from '@/utils/paragraphUtils';
import { logError, ValidationError } from '@/utils/errorHandling';

export interface CreateImprovedAnswerInput {
	/** The answer being improved. */
	source: Statement;
	/** Its question. */
	parent: Statement;
	/** The proposed wording. */
	text: string;
	/** Which concerns the new wording addresses. */
	reason: string;
}

/**
 * A substantive revision is a new proposition for judgment: it becomes a new
 * answer under the same question, carrying the reason as a paragraph that
 * points back at the source answer. Earlier ratings stay with the original;
 * nothing is endorsed on anyone's behalf.
 */
export async function createImprovedAnswer({
	source,
	parent,
	text,
	reason,
}: CreateImprovedAnswerInput): Promise<Statement> {
	const wording = text.trim();
	const why = reason.trim();
	if (!wording || !why) {
		throw new ValidationError('An improved answer needs wording and a reason', {
			operation: 'statements.createImprovedAnswer',
			statementId: source.statementId,
		});
	}
	if (wording === source.statement.trim()) {
		throw new ValidationError('The wording is unchanged', {
			operation: 'statements.createImprovedAnswer',
			statementId: source.statementId,
		});
	}

	try {
		const next = createStatement({
			text: wording,
			parentStatement: parent,
			statementType: StatementType.option,
			membership: parent.membership,
			paragraphs: [
				{
					paragraphId: generateParagraphId(),
					type: ParagraphType.paragraph,
					content: why,
					sourceStatementId: source.statementId,
					order: 0,
				},
			],
		});
		if (!next) throw new Error('Could not prepare the revised answer');

		const saved = await setStatementToDB({ statement: next, parentStatement: parent });
		if (!saved) throw new Error('Could not save the revised answer');

		return saved.statement;
	} catch (error) {
		logError(error, {
			operation: 'statements.createImprovedAnswer',
			statementId: source.statementId,
			metadata: { parentId: parent.statementId },
		});
		throw error;
	}
}
