import { FC } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { buildHostHubPath } from './hostHubLogic';
import styles from './InviteLinkToLive.module.scss';

interface InviteLinkToLiveProps {
	statementId: string;
	className?: string;
}

/** The one way People offers to invite: a link to the Live now card, where the link, PIN and QR live. */
const InviteLinkToLive: FC<InviteLinkToLiveProps> = ({ statementId, className }) => {
	const { t } = useTranslation();

	return (
		<Link
			to={buildHostHubPath(statementId, 'live')}
			className={clsx(styles.inviteLink, className)}
			data-testid="invite-link-to-live"
		>
			{t('people.inviteLinkInLive')}
		</Link>
	);
};

export default InviteLinkToLive;
