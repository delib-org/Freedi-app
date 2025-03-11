import { useNavigate, useParams } from 'react-router';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
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

const InitialQuestion = () => {
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const {
		handleSetInitialSuggestion,
		changeInput,
		ifButtonEnabled,
		ready,
		loading,
		subscription
	} = useInitialQuestion();
	const { t, dir } = useUserConfig();
	const [edit, setEdit] = useState(false);

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
			<HeaderMassConsensus
				title={t('offer a suggestion')}
				backTo={MassConsensusPageUrls.introduction}
			/>
			<div className="wrapper">
				{!edit ? <TitleMassConsensus
					title={t('please suggest a sentence to answer this question')}
				/> :
					<form onSubmit={handleSubmitInitialQuestionText}>
						<textarea
							className={styles.textarea}
							placeholder={t('please suggest a sentence to answer this question')}
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
				{isAdmin && !edit &&
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
				}
				<div
					className={styles.suggestionContainer}
					style={{ direction: dir }}
				>
					<h3>{t('Your description')}</h3>
					<input type='text' onChange={changeInput} />
				</div>
			</div>
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
