import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../FooterMassConsesus/FooterMassConsesus';
import { useLanguage } from '@/controllers/hooks/useLanguages';

const Introduction = () => {
	const { statement, loading, error } = useIntroductionMV();
	const { dir } = useParamsLanguage();
	const { t } = useLanguage();

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
				<FooterMassConsensus isIntro={true} goTo={MassConsensusPageUrls.initialQuestion}/>
			</div>
		</div>
	);
};

export default Introduction;
