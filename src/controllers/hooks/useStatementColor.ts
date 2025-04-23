import { StatementType, Statement } from 'delib-npm';
import { useEffect, useState } from 'react';

export interface StyleProps {
	backgroundColor: string;
	color: string;
}

export default function useStatementColor({
	statement,
}: {
	statement: Statement | undefined;
}): StyleProps {
	const initStyle = {
		backgroundColor: 'var(--header-home)',
		color: 'white',
	};

	const [style, setStyle] = useState(initStyle);

	// Only run the effect when the `statement` is available
	useEffect(() => {
		if (!statement) return;

		const { statementType, isChosen } = statement;

		if (statementType === StatementType.group) {
			setStyle({
				backgroundColor: 'var(--group, #b893e7)', // Purple shade for group type
				color: 'var(--group-text, #ffffff)', // Text color for group (white)
			});
		} else if (isChosen) {
			setStyle({
				backgroundColor: 'var(--agree, #008000)', // Green for agreement
				color: 'var(--header, #000000)', // Text color for chosen
			});
		} else if (statementType === StatementType.option) {
			setStyle({
				backgroundColor: 'var(--option, #123abc)', // Custom option color
				color: 'var(--white, #ffffff)', // Text color for options
			});
		} else if (statementType === StatementType.question) {
			setStyle({
				backgroundColor: 'var(--question, #123def)', // Custom question color
				color: 'var(--question-text, #fff)', // Text color for questions
			});
		} else {
			// Default colors
			setStyle(initStyle);
		}
	}, [statement]);

	return style;
}
