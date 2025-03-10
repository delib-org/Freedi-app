import { useNavigate, useParams } from 'react-router';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useSelector } from 'react-redux';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { useEffect } from 'react';
import { useInitialQuestion } from './InitialQuestionVM';
import { MassConsensusPageUrls } from 'delib-npm';
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
	} = useInitialQuestion();
	const { t, dir } = useUserConfig();

	useEffect(() => {
		if (!statement) navigate(`/mass-consensus/${statementId}/introduction`);
	}, [statementId, navigate]);

	useEffect(() => {
		if (ready)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.similarSuggestions}`
			);
	}, [ready]);

	return (
		<>
			<HeaderMassConsensus
				title={t('offer a suggestion')}
				backTo={MassConsensusPageUrls.introduction}
			/>
			<TitleMassConsensus
				title={t('please suggest a sentance that will unite Israel')}
			/>
			<div
				className={styles.suggestionContainer}
				style={{ direction: dir }}
			>
				<h3>{t('Your description')}</h3>
				<input type='text' onChange={changeInput} />
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
