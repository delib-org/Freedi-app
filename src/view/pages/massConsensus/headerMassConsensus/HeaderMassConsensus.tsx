import { Link, useParams } from 'react-router';
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import HomeIcon from '@/assets/icons/homeIcon.svg?react';
import styles from './HeaderMassConsensus.module.scss';
import { MassConsensusPageUrls } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const HeaderMassConsensus = ({
	backTo,
	backToApp,
	title,
	isIntro,
}: {
	backTo: MassConsensusPageUrls;
	backToApp?: boolean;
	title?: string;
	isIntro?: boolean;
}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { dir, currentLanguage } = useUserConfig();

	return (
		<div className={styles.headerMC} style={{ direction: dir }}>
			{isIntro ? (
				''
			) : (
				<Link
					className={
						dir === 'ltr'
							? styles.icon
							: `${styles.icon} ${styles['icon--ltr']}`
					}
					to={
						backToApp
							? `/statement/${statementId}`
							: `/mass-consensus/${statementId}/${backTo}?lang=${currentLanguage}`
					}
				>
					<BackIcon />
				</Link>
			)}
			<div
				className={styles['title-container']}
				style={{ direction: dir }}
			>
				<h1 className={styles.title}>{title}</h1>
			</div>

			{isIntro ? (
				''
			) : (
				<Link
					className={styles.icon}
					to={`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}?lang=${lang}`}
				>
					<HomeIcon />
				</Link>
			)}
		</div>
	);
};

export default HeaderMassConsensus;
