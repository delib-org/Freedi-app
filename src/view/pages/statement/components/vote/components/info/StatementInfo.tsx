import { Dispatch, FC, SetStateAction, useState } from 'react';

//image
import EditIcon from '@/assets/icons/editIcon.svg?react';
import infoGraphic from '@/assets/images/infoGraphic.png';
import { isAuthorized } from '@/controllers/general/helpers';

import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import styles from './StatementInfo.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import EditableStatement from '@/view/components/edit/EditableStatement';
import { Statement } from '@freedi/shared-types';

interface Props {
	statement: Statement | null;
	setShowInfo: Dispatch<SetStateAction<boolean>>;
}

const StatementInfo: FC<Props> = ({ statement, setShowInfo }) => {
	// Hooks
	const { t } = useTranslation();

	// Redux
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statement?.statementId),
	);
	const parentStatement = useAppSelector(statementSelector(statement?.parentId));

	// Use State
	const [isInEditMode, setIsInEditMode] = useState(false);

	if (!statement) return null;
	const _isAuthorized = isAuthorized(
		statement,
		statementSubscription,
		parentStatement?.creator?.uid,
	);

	return (
		<div className={styles.statementInfo}>
			<div className={styles.infoGraphic}>
				<img src={infoGraphic} alt="info" />
			</div>

			<div className={styles.texts}>
				<h3>
					<EditableStatement
						statement={statement}
						variant="statement"
						showDescription={false}
						forceEditing={isInEditMode}
						onEditStart={() => setIsInEditMode(true)}
						onSaveSuccess={() => {
							setIsInEditMode(false);
							setShowInfo(false);
						}}
						onEditEnd={() => setIsInEditMode(false)}
						className={styles.statementTitle}
						inputClassName={styles.titleInput}
					/>
					{_isAuthorized && !isInEditMode && (
						<button
							className={styles.editIcon}
							onClick={() => setIsInEditMode(true)}
							aria-label="Edit"
						>
							<EditIcon />
						</button>
					)}
				</h3>
				<div className={styles.text}>
					<EditableStatement
						statement={statement}
						variant="description"
						forceEditing={isInEditMode}
						onSaveSuccess={() => {
							setIsInEditMode(false);
						}}
						onEditEnd={() => setIsInEditMode(false)}
						className={styles.description}
						inputClassName={styles.descriptionInput}
						multiline={true}
						placeholder={t('description')}
					/>
				</div>
			</div>
			<div className={styles.formButtons}>
				<button className={styles.closeButton} onClick={() => setShowInfo(false)}>
					{t('Close')}
				</button>
			</div>
		</div>
	);
};

export default StatementInfo;
