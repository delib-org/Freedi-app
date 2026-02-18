import React, { useState, useCallback } from 'react';
import { Statement, Paragraph } from '@freedi/shared-types';
import RichTextEditor from './RichTextEditor';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { updateStatementParagraphs } from '@/controllers/db/statements/setStatements';
import styles from './DocumentEditModal.module.scss';

interface DocumentEditModalProps {
	statement: Statement;
	onClose: () => void;
}

const DocumentEditModal: React.FC<DocumentEditModalProps> = ({ statement, onClose }) => {
	const { t } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Get paragraphs from statement
	const getInitialParagraphs = useCallback((): Paragraph[] => {
		if (statement.paragraphs && statement.paragraphs.length > 0) {
			return statement.paragraphs;
		}

		return [];
	}, [statement.paragraphs]);

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
		[statement, onClose, t],
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
