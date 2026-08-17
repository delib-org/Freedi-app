import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { updateStatementSummary } from '@/controllers/db/summarization/summarizationController';
import { logError } from '@/utils/errorHandling';
import Text from '@/view/components/text/Text';
import styles from './SummaryDisplay.module.scss';

interface SummaryDisplayProps {
	summary: string | undefined;
	generatedAt?: number;
	/** Needed to save edits; without it the summary is read-only */
	statementId?: string;
	/** Show an Edit button so admins can apply final touches to the AI summary */
	canEdit?: boolean;
}

const SummaryDisplay: FC<SummaryDisplayProps> = ({
	summary,
	generatedAt,
	statementId,
	canEdit,
}) => {
	const { t } = useTranslation();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	if (!summary) return null;

	const formattedDate = generatedAt ? new Date(generatedAt).toLocaleDateString() : undefined;
	const isEditable = canEdit === true && Boolean(statementId);

	const startEditing = () => {
		setDraft(summary);
		setIsEditing(true);
	};

	const cancelEditing = () => {
		if (isSaving) return;
		setIsEditing(false);
		setDraft('');
	};

	const saveEdit = async () => {
		if (!statementId || draft.trim() === '') return;
		try {
			setIsSaving(true);
			await updateStatementSummary(statementId, draft.trim());
			setIsEditing(false);
		} catch (error) {
			logError(error, {
				operation: 'SummaryDisplay.saveEdit',
				statementId,
			});
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className={styles.summaryContainer}>
			<div className={styles.summaryHeader}>
				<h4>{t('Discussion Summary')}</h4>
				<div className={styles.headerActions}>
					{formattedDate && (
						<span className={styles.timestamp}>
							{t('Generated')}: {formattedDate}
						</span>
					)}
					{isEditable && !isEditing && (
						<button className={styles.editButton} onClick={startEditing} aria-label={t('Edit')}>
							{t('Edit')}
						</button>
					)}
				</div>
			</div>
			{isEditing ? (
				<div className={styles.editArea}>
					<textarea
						className={styles.editTextarea}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						rows={14}
						disabled={isSaving}
						aria-label={t('Discussion Summary')}
					/>
					<div className={styles.editActions}>
						<button className={styles.cancelButton} onClick={cancelEditing} disabled={isSaving}>
							{t('Cancel')}
						</button>
						<button
							className={styles.saveButton}
							onClick={saveEdit}
							disabled={isSaving || draft.trim() === ''}
						>
							{isSaving ? t('Saving...') : t('Save')}
						</button>
					</div>
				</div>
			) : (
				<div className={styles.summaryContent}>
					<Text description={summary} enableMarkdown={true} />
				</div>
			)}
		</div>
	);
};

export default SummaryDisplay;
