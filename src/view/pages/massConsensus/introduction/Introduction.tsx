
import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import { Link } from 'react-router';
import { MassConsensusPageUrls } from '../model/massConsensusModel';

const Introduction = () => {

	const { statement, loading, error } = useIntroductionMV();

	if (error) return <div>{error}</div>
	if (loading) return <div>Loading...</div>

	return (
		<div className={styles.introduction}>
			<h1>{statement?.statement}</h1>
			<p>{statement?.description}</p>
			<div className="btns">
				<Link to={`/mass-consensus/${statement?.statementId}/${MassConsensusPageUrls.InitialQuestion}`}>
					<button className="btn btn--agree">Start</button>
				</Link>
			</div>
		</div>
	)
}

export default Introduction