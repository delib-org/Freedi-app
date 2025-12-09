import React, { useState, useCallback } from 'react';
import { Statement } from 'delib-npm';
// TODO: Import from delib-npm once published with Paragraph types
import { Paragraph, StatementWithParagraphs } from '@/types/paragraph';
import RichTextEditor from './RichTextEditor';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { updateStatementParagraphs } from '@/controllers/db/statements/setStatements';
import { descriptionToParagraphs } from '@/utils/paragraphUtils';
import styles from './DocumentEditModal.module.scss';

// Extended statement type with paragraphs until delib-npm is updated
type StatementWithParagraphsExtended = Statement & StatementWithParagraphs;

interface DocumentEditModalProps {
	statement: Statement;
	onClose: () => void;
}

const DocumentEditModal: React.FC<DocumentEditModalProps> = ({
	statement,
	onClose,
}) => {
	const { t } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Cast to extended type for paragraphs access
	const extendedStatement = statement as StatementWithParagraphsExtended;

	// Get paragraphs from statement, or migrate from description
	const getInitialParagraphs = useCallback((): Paragraph[] => {
		if (extendedStatement.paragraphs && extendedStatement.paragraphs.length > 0) {
			return extendedStatement.paragraphs;
		}

		// Migrate from description if no paragraphs exist
		if (statement.description) {
			return descriptionToParagraphs(statement.description);
		}

		return [];
	}, [extendedStatement, statement.description]);

	const handleSave = useCallback(
		async (paragraphs: Paragraph[]) => {
			try {
				setIsLoading(true);
				setError(null);

				await updateStatementParagraphs(statement, paragraphs);

				onClose();
			} catch (err) {
				console.error('Error saving paragraphs:', err);
				setError(t('Failed to save changes. Please try again.'));
			} finally {
				setIsLoading(false);
			}
		},
		[statement, onClose, t]
	);

	const handleCancel = useCallback(() => {
		if (isLoading) return;
		onClose();
	}, [isLoading, onClose]);

	// Handle escape key
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !isLoading) {
				onClose();
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isLoading, onClose]);

	return (
		<div className={styles.modal}>
			<div className={styles.header}>
				<h2 className={styles.title}>{t('Edit Document')}</h2>
				<button
					type="button"
					className={styles.closeBtn}
					onClick={handleCancel}
					disabled={isLoading}
					aria-label={t('Close')}
				>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				{error && <div className={styles.error}>{error}</div>}

				<RichTextEditor
					paragraphs={getInitialParagraphs()}
					onSave={handleSave}
					onCancel={handleCancel}
					placeholder={t('Start writing your document...')}
					isLoading={isLoading}
				/>
			</div>
		</div>
	);
};

export default DocumentEditModal;
