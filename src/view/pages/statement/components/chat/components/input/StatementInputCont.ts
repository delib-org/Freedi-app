import { StatementType, Statement } from '@freedi/shared-types';
import { defaultStatementSettings } from './../../../settings/emptyStatementModel';
import { createStatement, setStatementToDB } from '@/controllers/db/statements/setStatements';
import { logError } from '@/utils/errorHandling';

export function handleAddStatement(
	message: string,
	statement: Statement,
	replyToStatement?: Statement | null,
) {
	try {
		const trimmed = message.trim();
		if (!trimmed) throw new Error('No value');

		// Send full multi-line text — Firebase Function splits into title + paragraph children
		const newStatement: Statement | undefined = createStatement({
			...defaultStatementSettings,
			hasChildren: true,
			text: trimmed,
			statementType: StatementType.statement,
			parentStatement: statement,
		});
		if (!newStatement) throw new Error('No statement was created');

		// Optimistic: extract first line as title, rest as description preview
		const lines = trimmed.split('\n');
		if (lines.length > 1) {
			const bodyLines = lines.slice(1).filter((line) => line.trim());
			if (bodyLines.length > 0) {
				newStatement.statement = lines[0].trim();
				const descriptionPreview = bodyLines.map((l) => l.trim()).join(' | ');
				newStatement.description =
					descriptionPreview.length > 200
						? descriptionPreview.substring(0, 197) + '...'
						: descriptionPreview;
			}
		}

		// Add replyTo metadata if replying to a specific message
		if (replyToStatement) {
			newStatement.replyTo = {
				statementId: replyToStatement.statementId,
				statement: replyToStatement.statement.slice(0, 150),
				creatorDisplayName: replyToStatement.creator.displayName,
			};
		}

		setStatementToDB({
			statement: newStatement,
			parentStatement: statement,
		});
	} catch (error) {
		logError(error, { operation: 'input.StatementInputCont.handleAddStatement' });
	}
}
