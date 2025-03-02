import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { useLanguageParams } from '../useParamsLang/useLanguageParams';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import MassConsensusFooter from '../MassConsensusFooter/MassConsensusFooter';

const Introduction = () => {
	const { statement, loading, error } = useIntroductionMV();
	const { dir } = useLanguageParams();
	const { t } = useUserConfig();
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
				<MassConsensusFooter
					isIntro={true}
					goTo={MassConsensusPageUrls.initialQuestion}
				/>
			</div>
		</div>
	);
};

export default Introduction;
