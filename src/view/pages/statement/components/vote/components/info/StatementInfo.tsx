import { Dispatch, FC, SetStateAction, useState } from 'react';
import { handleSubmitInfo } from './StatementInfoCont';

//image
import EditIcon from '@/assets/icons/editIcon.svg?react';
import infoGraphic from '@/assets/images/infoGraphic.png';
import { isAuthorized } from '@/controllers/general/helpers';

import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import './StatementInfo.scss';
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
		<div className='statement-info'>
			<div className='info-graphic'>
				<img src={infoGraphic} alt='info' />
			</div>

			{isInEditMode ? (
				<form
					className='form'
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
					<div className='inputs'>
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
					<div className='form-buttons'>
						<button
							type='button'
							className='cancel-button'
							onClick={() => setIsInEditMode(false)}
						>
							{t('Cancel')}
						</button>
						<button type='submit' className='save-button'>
							{t('Save')}
						</button>
					</div>
				</form>
			) : (
				<>
					<div className='texts'>
						<h3>
							{formData.title}
							{_isAuthorized && (
								<button
									className='edit-icon'
									onClick={() => setIsInEditMode(true)}
									aria-label='Edit'
								>
									<EditIcon />
								</button>
							)}
						</h3>
						<div className='text'>
							<Text description={formData.description || ''} />
						</div>
					</div>
					<div className='form-buttons'>
						<button
							className='close-button'
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
