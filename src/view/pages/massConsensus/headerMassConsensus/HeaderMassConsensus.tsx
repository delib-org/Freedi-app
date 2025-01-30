import { Link, useParams } from 'react-router';
import BackIcon from '../../../../assets/icons/arrow-left.svg?react';
import styles from './HeaderMassConsensus.module.scss';
import { MassConsensusPageUrls } from '../model/massConsensusModel';

const HeaderMassConsensus = ({ backTo }: { backTo: MassConsensusPageUrls }) => {
	const { statementId } = useParams<{ statementId: string }>();
	return (
		<div className={styles.headerMC}>
			<Link className={styles.back} to={`/mass-consensus/${statementId}/${backTo}`}>
				<BackIcon />
			</Link>

		</div >
	)
}

export default HeaderMassConsensus