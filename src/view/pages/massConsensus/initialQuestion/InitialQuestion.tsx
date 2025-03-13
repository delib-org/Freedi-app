import { useNavigate, useParams } from 'react-router';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useSelector } from 'react-redux';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { useEffect, useState } from 'react';
import { useInitialQuestion } from './InitialQuestionVM';
import { MassConsensusPageUrls, Role } from 'delib-npm';
import Loader from '@/view/components/loaders/Loader';
import styles from './InitialQuestion.module.scss';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import Textarea from '@/view/components/textarea/Textarea';

const InitialQuestion = () => {
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const [description, setDescription] = useState('');
	const {
		handleSetInitialSuggestion,
		ifButtonEnabled,
		ready,
		loading,
		subscription
	} = useInitialQuestion(description);
	const { t } = useUserConfig();
	const [edit, setEdit] = useState(false);

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('offer a suggestion'),
			backTo: MassConsensusPageUrls.introduction,
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	const isAdmin = subscription?.role === Role.admin;

	useEffect(() => {
		if (!statement) navigate(`/mass-consensus/${statementId}/introduction`);
	}, [statementId, navigate]);

	useEffect(() => {
		if (ready)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.similarSuggestions}`
			);
	}, [ready]);

	function handleSubmitInitialQuestionText(e) {
		e.preventDefault();
	}

	return (
		<>
			{!edit ? <TitleMassConsensus
				title={t('Please suggest a sentence to answer this question')}
			/> :
				<form onSubmit={handleSubmitInitialQuestionText}>
					<textarea
						className={styles.textarea}
						placeholder={t('Please suggest a sentence to answer this question')}
					/>
					<div className="btns">
						<button
							className="btn btn--primary"
							type="submit"
						>
							{t('submit')}
						</button>
					</div>
				</form>
			}
			{/* {isAdmin && !edit &&
				<div className='btns'>
					<button
						className="btn btn--secondary"
						onClick={() => setEdit(true)}
						onKeyUp={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								setEdit(true);
							}
						}}
						tabIndex={0}
					>
						Edit
					</button>
				</div>
			} */}
			<Textarea
				name='your-description'
				label={t('Your description')}
				placeholder={t('Propose a sentence that will unify')}
				backgroundColor='var(--bg-screen)'
				maxLength={120}
				onChange={setDescription}
				value={description}
			/>
			<FooterMassConsensus
				goTo={MassConsensusPageUrls.randomSuggestions}
				onNext={handleSetInitialSuggestion}
				isNextActive={ifButtonEnabled}
			/>
			{loading && <Loader />}
		</>
	);
};

export default InitialQuestion;
