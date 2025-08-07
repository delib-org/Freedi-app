import { Dispatch, FC, SetStateAction, useState } from 'react';
import { handleSubmitInfo } from './StatementInfoCont';

//image
import EditIcon from '@/assets/icons/editIcon.svg?react';
import infoGraphic from '@/assets/images/infoGraphic.png';
import { isAuthorized } from '@/controllers/general/helpers';

import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import styles from './StatementInfo.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import Text from '@/view/components/text/Text';
import { Statement } from 'delib-npm';

interface Props {
	statement: Statement | null;
	setShowInfo: Dispatch<SetStateAction<boolean>>;
}

const StatementInfo: FC<Props> = ({ statement, setShowInfo }) => {
	// Hooks
	const { t } = useUserConfig();

	// Redux
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statement?.statementId)
	);
	const parentStatement = useAppSelector(
		statementSelector(statement?.parentId)
	);

	// Use State
	const [isInEditMode, setIsInEditMode] = useState(false);
	const [formData, setFormData] = useState({
		title: statement?.statement || '',
		description: statement?.description || '',
	});

	if (!statement) return null;
	const _isAuthorized = isAuthorized(
		statement,
		statementSubscription,
		parentStatement?.creator.uid
	);

	return (
		<div className={styles.statementInfo}>
			<div className={styles.infoGraphic}>
				<img src={infoGraphic} alt='info' />
			</div>

			{isInEditMode ? (
				<form
					className={styles.form}
					onSubmit={(e) =>
						handleSubmitInfo(
							e,
							formData,
							statement,
							setIsInEditMode,
							setShowInfo
						)
					}
				>
					<div className={styles.inputs}>
						<input
							type='text'
							value={formData.title}
							onChange={(e) =>
								setFormData({
									...formData,
									title: e.target.value,
								})
							}
							required={true}
						/>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({
									...formData,
									description: e.target.value,
								})
							}
							placeholder={t('description')}
						/>
					</div>
					<div className={styles.formButtons}>
						<button
							type='button'
							className={styles.cancelButton}
							onClick={() => setIsInEditMode(false)}
						>
							{t('Cancel')}
						</button>
						<button type='submit' className={styles.saveButton}>
							{t('Save')}
						</button>
					</div>
				</form>
			) : (
				<>
					<div className={styles.texts}>
						<h3>
							{formData.title}
							{_isAuthorized && (
								<button
									className={styles.editIcon}
									onClick={() => setIsInEditMode(true)}
									aria-label='Edit'
								>
									<EditIcon />
								</button>
							)}
						</h3>
						<div className={styles.text}>
							<Text description={formData.description || ''} />
						</div>
					</div>
					<div className={styles.formButtons}>
						<button
							className={styles.closeButton}
							onClick={() => setShowInfo(false)}
						>
							{t('Close')}
						</button>
					</div>
				</>
			)}
		</div>
	);
};

export default StatementInfo;
