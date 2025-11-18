import { FC, useContext, useState } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import EditableStatement from '@/view/components/edit/EditableStatement';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import Text from '@/view/components/text/Text';
import styles from './EditableDescription.module.scss';

const EditableDescription: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const [isInEditMode, setIsInEditMode] = useState(false);

	// Check if current user can edit (creator or admin)
	const { canEdit } = useEditPermission(statement);

	if (!statement) {
		return null;
	}

	// If no description and user can't edit, don't show anything
	if (!statement.description && !canEdit) {
		return null;
	}

	// Read-only mode for users without permission
	if (!canEdit) {
		return (
			<div className={styles.description}>
				<Text description={statement.description} />
			</div>
		);
	}

	// Editable mode for authorized users
	return (
		<div className={styles.editableDescription}>
			<div className={styles.descriptionHeader}>
				{!isInEditMode && (
					<button
						className={styles.editButton}
						onClick={() => setIsInEditMode(true)}
						aria-label={t('Edit description')}
						title={t('Edit description')}
					>
						<EditIcon />
						<span>{t('Edit Description')}</span>
					</button>
				)}
			</div>

			<div className={styles.descriptionContent}>
				<EditableStatement
					statement={statement}
					variant="description"
					multiline={true}
					forceEditing={isInEditMode}
					onEditStart={() => setIsInEditMode(true)}
					onSaveSuccess={() => {
						setIsInEditMode(false);
					}}
					onEditEnd={() => setIsInEditMode(false)}
					placeholder={t('Add a description...')}
					className={styles.description}
					inputClassName={styles.descriptionInput}
					textClassName={styles.descriptionText}
					saveButtonClassName={styles.saveButton}
				/>
			</div>
		</div>
	);
};

export default EditableDescription;