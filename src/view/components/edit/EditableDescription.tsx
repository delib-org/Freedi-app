import React, { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { DocumentEditModal, ParagraphsDisplay } from '@/view/components/richTextEditor';
import { hasParagraphsContent } from '@/utils/paragraphUtils';
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

	const hasParagraphs = hasParagraphsContent(statement.paragraphs);

	// Read-only mode for users without permission
	if (!isEditable) {
		if (!hasParagraphs) return null;

		return (
			<div className={styles.description}>
				<ParagraphsDisplay statement={statement} />
			</div>
		);
	}

	// Editable mode - click to open rich editor
	// Use different class when empty to hide on mobile
	const containerClass = hasParagraphs
		? styles.editableDescription
		: `${styles.editableDescription} ${styles.editableDescriptionEmpty}`;

	return (
		<>
			<button
				type="button"
				className={containerClass}
				onClick={() => setIsEditorOpen(true)}
			>
				<div className={styles.editButton}>
					<EditIcon />
					<span>{t('Edit Description')}</span>
				</div>

				<div className={styles.descriptionContent}>
					{hasParagraphs ? (
						<ParagraphsDisplay statement={statement} />
					) : (
						<p className={styles.placeholder}>{t(placeholder)}</p>
					)}
				</div>
			</button>

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