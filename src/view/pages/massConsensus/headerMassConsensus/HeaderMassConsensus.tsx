// Third-party Libraries
import { Link, useParams } from 'react-router';
import { useSelector } from 'react-redux';

// NPM Packages
import { Role } from 'delib-npm';

// Redux Store
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';

// App Hooks
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

// Icons
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import HomeIcon from '@/assets/icons/homeIcon.svg?react';
import SmileIcon from '@/assets/icons/smile.svg?react';

// Local Imports - Hooks
import { useHeader } from './HeaderContext';
import { useMassConsensusSteps } from '../MassConsensusVM';

// Local Imports - Utilities
import { getStepNavigation } from '../MassConsensusVM';

import styles from './HeaderMassConsensus.module.scss';

const HeaderMassConsensus = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const { dir } = useUserConfig();
	const { backToApp } = useHeader();
	const role = useSelector(statementSubscriptionSelector(statementId))?.role;
	const { steps, currentStep } = useMassConsensusSteps();
	const { previousStep } = getStepNavigation(steps, currentStep);
	const showMySuggestions = true; // TODO: add condition to show this icon only when the user has suggestions for this statement

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

				<div className={styles.rightIcons}>
					{showMySuggestions && (

						<Link
							className={styles.icon}
							to={`/my-suggestions/statement/${statementId}`}
							title="My Suggestions"
						>
							<SmileIcon />
						</Link>
					)}
					<Link
						className={styles.icon}
						to={role === Role.admin ? `/statement/${statementId}` : `/home`}
					>
						<HomeIcon />
					</Link>
				</div>
			</div>
		</div>
	);
};

export default HeaderMassConsensus;
