import { FC } from 'react';
import { Link, useParams } from 'react-router';
import MembersIcon from '@/assets/icons/group.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { buildPeopleAnchorPath } from '@/view/pages/statement/components/host/hostHubLogic';
import { useApproveMembership } from './WaitingListVM';
import { formatWaitingCount, pickWaitingStatementId } from './waitingBadgeLogic';
import styles from './WaitingList.module.scss';

/**
 * Header badge: how many people wait to join the spaces this host runs. A
 * shortcut, not a second list: it opens People › Waiting to join of the
 * space on screen (or the space where most people wait). Hidden at 0.
 */
const WaitingList: FC = () => {
	const { waitingList } = useApproveMembership();
	const { statementId } = useParams();
	const { t } = useTranslation();

	const targetStatementId = pickWaitingStatementId(waitingList, statementId);
	if (!targetStatementId) return null;

	const count = waitingList.length;

	return (
		<span className={`badge-container ${styles.waitingBadge}`}>
			<Link
				to={buildPeopleAnchorPath(targetStatementId, 'waiting')}
				className={styles.waitingBadge__link}
				aria-label={fillPlaceholders(t('people.waitingCount'), { count })}
				data-testid="waiting-badge"
			>
				<MembersIcon aria-hidden="true" />
			</Link>
			<span
				className={`badge badge--unread badge--small badge--top-right ${styles.waitingBadge__count}`}
				aria-hidden="true"
			>
				{formatWaitingCount(count)}
			</span>
		</span>
	);
};

export default WaitingList;
