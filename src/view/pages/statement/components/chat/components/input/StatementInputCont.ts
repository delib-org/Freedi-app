import { StatementType, Statement, ParagraphType } from '@freedi/shared-types';
import { defaultStatementSettings } from './../../../settings/emptyStatementModel';
import { createStatement, setStatementToDB } from '@/controllers/db/statements/setStatements';
import { generateParagraphId } from '@/utils/paragraphUtils';
import { logError } from '@/utils/errorHandling';

export function handleAddStatement(message: string, statement: Statement) {
	try {
		//remove white spaces and \n
		const lines = message.split('\n');
		const title = lines[0];
		const bodyLines = lines.slice(1).filter((line) => line.trim());

		if (!title) throw new Error('No value');

		// Convert body lines to paragraphs
		const paragraphs = bodyLines.map((line, index) => ({
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: line,
			order: index,
		}));

		const newStatement: Statement | undefined = createStatement({
			...defaultStatementSettings,
			hasChildren: true,
			text: title,
			paragraphs,
			statementType: StatementType.statement,
			parentStatement: statement,
		});
		if (!newStatement) throw new Error('No statement was created');

		setStatementToDB({
			statement: newStatement,
			parentStatement: statement,
		});
	} catch (error) {
		logError(error, { operation: 'input.StatementInputCont.paragraphs' });
	}
}
