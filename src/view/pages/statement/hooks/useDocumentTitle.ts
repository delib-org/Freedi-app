import { useEffect } from 'react';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { Statement } from 'delib-npm';
import { APP_CONSTANTS } from '../constants';

interface UseDocumentTitleProps {
	statement: Statement | null;
	screen?: string;
}

export const useDocumentTitle = ({ statement, screen }: UseDocumentTitleProps) => {
	useEffect(() => {
		if (!statement || !screen) {
			document.title = APP_CONSTANTS.DOCUMENT_TITLE_PREFIX;
			
			return;
		}

		try {
			const { shortVersion } = statementTitleToDisplay(
				statement.statement, 
				APP_CONSTANTS.TITLE_MAX_LENGTH
			);
			document.title = `${APP_CONSTANTS.DOCUMENT_TITLE_PREFIX} - ${shortVersion}`;
		} catch (error) {
			console.error('Error setting document title:', error);
			document.title = APP_CONSTANTS.DOCUMENT_TITLE_PREFIX;
		}
	}, [statement, screen]);
};
