import { Link, useParams } from 'react-router';
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import HomeIcon from '@/assets/icons/homeIcon.svg?react';
import styles from './HeaderMassConsensus.module.scss';
import { MassConsensusPageUrls, Role } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from './HeaderContext';
import { useSelector } from 'react-redux';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { getStepNavigation, useMassConsensusSteps } from '../MassConsensusVM';
import MySuggestionsIcon from '@/assets/icons/evaluations2Icon.svg?react';

const HeaderMassConsensus = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const { dir } = useUserConfig();
	const { title, backToApp, isIntro } = useHeader();
	const role = useSelector(statementSubscriptionSelector(statementId))?.role;
	const { steps, currentStep } = useMassConsensusSteps();
	const { previousStep } = getStepNavigation(steps, currentStep);

	const computedTitle = typeof title === 'function' ? title() : title;

	return (
		<div className={`app-header app-header--shadow ${styles.headerMC}`} style={{ direction: dir }}>
			<div className={`app-header-wrapper ${styles.headerMC__wrapper}`}>
				{previousStep && (
					<Link
						className={
							dir === 'rtl'
								? `${styles.icon} ${styles['icon--rtl']}`
								: styles.icon
						}
						to={
							backToApp
								? `/statement/${statementId}`
								: `/mass-consensus/${statementId}/${previousStep}`
						}
					>
						<BackIcon />
					</Link>
				)}
				<div
					className={styles['title-container']}
					style={{ direction: dir }}
				>
					<h1 className={`app-header-title ${styles.title}`}>{computedTitle}</h1>
				</div>

				<div className={styles.rightIcons}>
					{!isIntro && (
						<>
							<Link
								className={styles.icon}
								to={`/my-suggestions/statement/${statementId}`}
								title="My Suggestions"
							>
								<MySuggestionsIcon />
							</Link>
							<Link
								className={styles.icon}
								to={role === Role.admin ? `/statement/${statementId}` : `/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`}
							>
								<HomeIcon />
							</Link>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default HeaderMassConsensus;
