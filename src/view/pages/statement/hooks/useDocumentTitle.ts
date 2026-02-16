import { useEffect } from 'react';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { Statement } from '@freedi/shared-types';
import { APP_CONSTANTS } from '../constants';

interface UseDocumentTitleProps {
	statement: Statement | null;
}

export const useDocumentTitle = ({ statement }: UseDocumentTitleProps) => {
	useEffect(() => {
		if (!statement) {
			document.title = APP_CONSTANTS.DOCUMENT_TITLE_PREFIX;

			return;
		}

		try {
			const { shortVersion } = statementTitleToDisplay(
				statement.statement,
				APP_CONSTANTS.TITLE_MAX_LENGTH,
			);
			document.title = `${APP_CONSTANTS.DOCUMENT_TITLE_PREFIX} - ${shortVersion}`;
		} catch (error) {
			console.error('Error setting document title:', error);
			document.title = APP_CONSTANTS.DOCUMENT_TITLE_PREFIX;
		}
	}, [statement]);
};
