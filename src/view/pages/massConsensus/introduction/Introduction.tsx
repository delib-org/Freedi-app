import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../footerMassConsesus/footerMassConsesus';

const Introduction = () => {
	const { statement, loading, error } = useIntroductionMV();
	const { dir } = useParamsLanguage();

	if (error) return <div>{error}</div>;
	if (loading) return <div>Loading...</div>;

	return (
		<div className={styles.introduction} style={{ direction: dir }}>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.introduction}
				backToApp={true}
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
