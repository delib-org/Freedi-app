import { useIntroductionMV } from './IntroductionMV';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useEffect, useState } from 'react';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { useDispatch } from 'react-redux';
import { setStatement } from '@/redux/statements/statementsSlice';
import Text from '@/view/components/text/Text';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import {
	listenToUserDemographicAnswers,
	listenToUserDemographicQuestions,
} from '@/controllers/db/userDemographic/getUserDemographic';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';
import styles from './Introduction.module.scss';

const Introduction = () => {
	const { t } = useUserConfig();
	const dispatch = useDispatch();
	const { statement, loading, error, subscription } = useIntroductionMV();
	const [edit, setEdit] = useState(false);
	const role = subscription?.role;
	const { user } = useAuthentication();
	const { setHeader } = useHeader();
	const { trackStageCompleted } = useMassConsensusAnalytics();

	useEffect(() => {
		setHeader({
			title: t('description'),
			backToApp: false,
			isIntro: true,
			setHeader,
		});
	}, []);
	const statementId = statement?.statementId;
	const imageUrl = statement?.imagesURL?.main ?? '';
	const uid = user?.uid;
	useEffect(() => {
		if (!statementId || !uid) return;

		const unsubscribeQuestions = listenToUserDemographicQuestions(statementId);
		const unsubscribeAnswers = listenToUserDemographicAnswers(statementId);

		return () => {
			unsubscribeQuestions();
			unsubscribeAnswers();
		};
	}, [statementId, uid]);
	if (error) return <div>{error}</div>;
	if (loading) return <div>Loading...</div>;

	function handleSubmitDescription(e) {
		e.preventDefault();
		const _description = e.target.description.value;

		setEdit(false);
		if (
			_description &&
			_description !== statement?.description &&
			statement
		)
			updateStatementText(statement, undefined, _description);
		const newStatement = { ...statement, description: _description };
		dispatch(setStatement(newStatement));
	}

	return (
		<div className={styles.introduction}>
			<div className={styles.wrapper}>
				<h1>{statement?.statement}</h1>
				{!edit ? (
					<Text description={statement?.description} />
				) : (
					<form onSubmit={handleSubmitDescription}>
						<textarea
							name='description'
							defaultValue={statement?.description}
							placeholder={t('Add description here')}
						></textarea>
						<div className='btns'>
							<button className='btn btn-primary' type='submit'>
								Save
							</button>
							<button
								className='btn btn-secondary'
								onClick={() => setEdit(false)}
							>
								Cancel
							</button>
						</div>
					</form>
				)}
				{imageUrl && <img className={styles.img} src={imageUrl} alt='Statement visual representation' />}
			</div>
			{role === 'admin' && !edit && (
				<div className='btns'>
					<button
						className='btn btn-primary'
						onClick={() => setEdit(true)}
					>
						Edit
					</button>
				</div>
			)}

			<FooterMassConsensus
				isIntro={true}
				onNext={() => trackStageCompleted('introduction')}
			/>
		</div>
	);
};

export default Introduction;
