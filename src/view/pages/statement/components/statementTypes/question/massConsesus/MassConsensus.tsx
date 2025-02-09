import styles from './MassConsensus.module.scss'
import Description from '../../../evaluations/components/description/Description'
import { NavLink, useParams } from 'react-router'

const MassConsensus = () => {
	const { statementId } = useParams<{ statementId: string }>()

	return (
		<div className={styles.simpleQuestion}>
			<div className={styles.wrapper}>
				<Description />

				<NavLink to={`/mass-consensus/${statementId}`}>
					This is the link to the Mass Consensus Question
				</NavLink>

			</div>
		</div>
	)
}

export default MassConsensus