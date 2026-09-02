import { FC, Suspense, lazy, useContext, useState } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import ParagraphsDisplay from '@/view/components/richTextEditor/ParagraphsDisplay';
// TipTap loads when the reader opens the editor, not on every page.
const DescriptionEditor = lazy(() => import('@/view/components/richTextEditor/DescriptionEditor'));
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

	// Editable mode for authorized users - click to edit in place with a simple WYSIWYG editor
	if (isEditorOpen) {
		return (
			<Suspense fallback={<div className="statement-body__editor-loading" />}>
				<DescriptionEditor statement={statement} onClose={() => setIsEditorOpen(false)} />
			</Suspense>
		);
	}

	// Use different class when empty to hide on mobile
	const containerClass = hasParagraphs
		? styles.editableDescription
		: `${styles.editableDescription} ${styles.editableDescriptionEmpty}`;

	return (
		<button type="button" className={containerClass} onClick={() => setIsEditorOpen(true)}>
			<div className={styles.descriptionHeader}>
				<div className={styles.editButton}>
					<EditIcon />
					<span>{t('Edit Description')}</span>
				</div>
			</div>

			{/* Only render content area if there's content, or hide placeholder on mobile */}
			<div className={styles.descriptionContent}>
				{hasParagraphs ? (
					<ParagraphsDisplay statement={statement} />
				) : (
					<p className={styles.placeholder}>{t('Add a description...')}</p>
				)}
			</div>
		</button>
	);
};

export default EditableDescription;
