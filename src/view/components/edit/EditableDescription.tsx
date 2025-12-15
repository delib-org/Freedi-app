import React, { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { DocumentEditModal, ParagraphsDisplay } from '@/view/components/richTextEditor';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import styles from './EditableDescription.module.scss';

interface EditableDescriptionProps {
	statement: Statement | undefined;
	placeholder?: string;
	onSaveSuccess?: () => void;
	onSaveError?: (error: Error) => void;
	forceEditable?: boolean;
}

const EditableDescription: FC<EditableDescriptionProps> = ({
	statement,
	placeholder = 'Add a description...',
	forceEditable = false,
}) => {
	const { t } = useTranslation();
	const { canEdit } = useEditPermission(statement);
	const isEditable = forceEditable || canEdit;
	const [isEditorOpen, setIsEditorOpen] = useState(false);

	if (!statement) return null;

	// Read-only mode for users without permission
	if (!isEditable) {
		if (!statement.description) return null;

		return (
			<div className={styles.description}>
				<ParagraphsDisplay statement={statement} />
			</div>
		);
	}

	// Editable mode - click to open rich editor
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
				<div className={styles.editButton}>
					<EditIcon />
					<span>{t('Edit Description')}</span>
				</div>

				<div className={styles.descriptionContent}>
					{statement.description ? (
						<ParagraphsDisplay statement={statement} />
					) : (
						<p className={styles.placeholder}>{t(placeholder)}</p>
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