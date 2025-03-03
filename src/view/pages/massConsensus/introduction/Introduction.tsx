import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getMassConsensusQuestion } from '@/controllers/db/massConsensus/getMassConsensus';
import { useParams } from 'react-router';
import { selectMassConsensusTexts, setMassConsensusTexts } from '@/redux/massConsensus/massConsensusSlice';

const Introduction = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const { statement, loading, error } = useIntroductionMV();
	const dispatch = useDispatch();
	const { dir } = useParamsLanguage();
	const { t } = useLanguage();
	const massConsensusTexts = useSelector(selectMassConsensusTexts(statementId));

	useEffect(() => {
		if (!statement) return;

		getMassConsensusQuestion(statementId).then((question) => {
			if (question) {
				dispatch(setMassConsensusTexts(question));
			}
		});
	}, [statementId, dispatch]);

	if (error) return <div>{error}</div>;
	if (loading) return <div>Loading...</div>;

	return (
		<div className={styles.introduction} style={{ direction: dir }}>
			<HeaderMassConsensus
				title={t('description')}
				backTo={MassConsensusPageUrls.introduction}
				backToApp={false}
				isIntro={true}
			/>
			<div className={styles.wrapper}>
				<h1>{statement?.statement}</h1>
				<p>{statement?.description}</p>
				{massConsensusTexts && <p>{massConsensusTexts.texts?.introduction}</p>}
				<FooterMassConsensus isIntro={true} goTo={MassConsensusPageUrls.initialQuestion} />
			</div>
		</div>
	);
};

export default Introduction;
