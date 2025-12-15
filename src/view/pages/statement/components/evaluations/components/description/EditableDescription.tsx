import { FC, useContext, useState } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import { DocumentEditModal, ParagraphsDisplay } from '@/view/components/richTextEditor';
import { hasParagraphsContent } from '@/utils/paragraphUtils';
import styles from './EditableDescription.module.scss';

const EditableDescription: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const [isEditorOpen, setIsEditorOpen] = useState(false);

	// Check if current user can edit (creator or admin)
	const { canEdit } = useEditPermission(statement);

	if (!statement) {
		return null;
	}

	const hasParagraphs = hasParagraphsContent(statement.paragraphs);

	// If no paragraphs and user can't edit, don't show anything
	if (!hasParagraphs && !canEdit) {
		return null;
	}

	// Read-only mode for users without permission
	if (!canEdit) {
		return (
			<div className={styles.description}>
				<ParagraphsDisplay statement={statement} />
			</div>
		);
	}

	// Editable mode for authorized users - click to open rich editor
	return (
		<>
			<div
				className={styles.editableDescription}
				onClick={() => setIsEditorOpen(true)}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						setIsEditorOpen(true);
					}
				}}
			>
				<div className={styles.descriptionHeader}>
					<button
						className={styles.editButton}
						onClick={(e) => {
							e.stopPropagation();
							setIsEditorOpen(true);
						}}
						aria-label={t('Edit description')}
						title={t('Edit description')}
					>
						<EditIcon />
						<span>{t('Edit Description')}</span>
					</button>
				</div>

				<div className={styles.descriptionContent}>
					{hasParagraphs ? (
						<ParagraphsDisplay statement={statement} />
					) : (
						<p className={styles.placeholder}>{t('Add a description...')}</p>
					)}
				</div>
			</div>

			{isEditorOpen && (
				<DocumentEditModal
					statement={statement}
					onClose={() => setIsEditorOpen(false)}
				/>
			)}
		</>
	);
};

export default EditableDescription;