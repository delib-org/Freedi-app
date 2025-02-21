import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { Statement } from '@/types/statement/Statement';
import { FormEvent, Dispatch, SetStateAction } from 'react';

export function handleSubmitInfo(
	e: FormEvent<HTMLFormElement>,
	formData: {
		title: string;
		description: string;
	},
	statement: Statement | undefined,
	setEdit: Dispatch<SetStateAction<boolean>>,
	setShowInfo: Dispatch<SetStateAction<boolean>>
) {
	e.preventDefault();
	try {
		//get data from form
		const title = formData.title;
		const description = formData.description;

		//add title and description

		//update statement to DB
		if (!statement) throw new Error('No statement');
		updateStatementText(statement, title, description);
		setEdit(false);
		setShowInfo(false);
	} catch (error) {
		console.error(error);
	}
}
