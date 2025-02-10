import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import { Link } from 'react-router';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/enums';

const Introduction = () => {

	const { statement, loading, error } = useIntroductionMV();
	const { dir, lang } = useParamsLanguage();

	if (error) return <div>{error}</div>
	if (loading) return <div>Loading...</div>

	return (
		<div className={styles.introduction} style={{ direction: dir }}>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.introduction} backToApp={true} />
			<div className={styles.wrapper}>
				<h1>{statement?.statement}</h1>
				<p>{statement?.description}</p>
				<div className="btns">
					<Link to={`/mass-consensus/${statement?.statementId}/${MassConsensusPageUrls.initialQuestion}?lang=${lang}`}>
						<button className="btn btn--agree">Start</button>
					</Link>
				</div>
			</div>
		</div>
	)
}

export default Introduction