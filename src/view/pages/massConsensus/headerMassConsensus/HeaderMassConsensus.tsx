import { Link, useParams } from 'react-router';
import BackIcon from '../../../../assets/icons/chevronLeftIcon.svg?react';
import styles from './HeaderMassConsensus.module.scss';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';

const HeaderMassConsensus = ({
	backTo,
	backToApp,
}: {
	backTo: MassConsensusPageUrls;
	backToApp?: boolean;
}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { dir, lang } = useParamsLanguage();

	return (
		<div className={styles.headerMC} style={{ direction: dir }}>
			<Link
				className={
					dir === 'ltr'
						? styles.back
						: `${styles.back} ${styles['back--ltr']}`
				}
				to={
					backToApp
						? `/statement/${statementId}`
						: `/mass-consensus/${statementId}/${backTo}?lang=${lang}`
				}
			>
				<BackIcon />
			</Link>
		</div>
	);
};

export default HeaderMassConsensus;
