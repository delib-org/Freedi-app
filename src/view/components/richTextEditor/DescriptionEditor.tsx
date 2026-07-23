import React, { useState, useCallback } from 'react';
import { Statement, Paragraph } from '@freedi/shared-types';
import RichTextEditor from './RichTextEditor';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { updateStatementParagraphs } from '@/controllers/db/statements/setStatements';
import styles from './DescriptionEditor.module.scss';
import { logError } from '@/utils/errorHandling';

interface DescriptionEditorProps {
	statement: Statement;
	onClose: () => void;
}

/**
 * Simple inline WYSIWYG editor for a statement's description.
 * Renders in place of the description (no modal) and saves paragraphs on Save.
 */
const DescriptionEditor: React.FC<DescriptionEditorProps> = ({ statement, onClose }) => {
	const { t } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSave = useCallback(
		async (paragraphs: Paragraph[]) => {
			try {
				setIsLoading(true);
				setError(null);

				await updateStatementParagraphs(statement, paragraphs);

				onClose();
			} catch (err) {
				logError(err, {
					operation: 'richTextEditor.DescriptionEditor.handleSave',
					statementId: statement.statementId,
				});
				setError(t('Failed to save changes. Please try again.'));
			} finally {
				setIsLoading(false);
			}
		},
		[statement, onClose, t],
	);

	return (
		<div className={styles.descriptionEditor}>
			{error && <div className={styles.error}>{error}</div>}

			<RichTextEditor
				paragraphs={statement.paragraphs ?? []}
				onSave={handleSave}
				onCancel={onClose}
				placeholder={t('Add a description...')}
				isLoading={isLoading}
				compact
			/>
		</div>
	);
};

export default DescriptionEditor;
