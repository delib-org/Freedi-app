import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { Statement, ParagraphType } from '@freedi/shared-types';
import { FormEvent, Dispatch, SetStateAction } from 'react';
import { generateParagraphId } from '@/utils/paragraphUtils';
import { logError } from '@/utils/errorHandling';

export function handleSubmitInfo(
	e: FormEvent<HTMLFormElement>,
	formData: {
		title: string;
		description: string;
	},
	statement: Statement | undefined,
	setEdit: Dispatch<SetStateAction<boolean>>,
	setShowInfo: Dispatch<SetStateAction<boolean>>,
) {
	e.preventDefault();
	try {
		//get data from form
		const title = formData.title;
		const descriptionText = formData.description;

		// Convert description text to paragraphs array
		const paragraphs = descriptionText.trim()
			? descriptionText
					.split('\n')
					.filter((line) => line.trim())
					.map((line, index) => ({
						paragraphId: generateParagraphId(),
						type: ParagraphType.paragraph,
						content: line,
						order: index,
					}))
			: undefined;

		//update statement to DB
		if (!statement) throw new Error('No statement');
		updateStatementText(statement, title, paragraphs);
		setEdit(false);
		setShowInfo(false);
	} catch (error) {
		logError(error, { operation: 'info.StatementInfoCont.unknown' });
	}
}
