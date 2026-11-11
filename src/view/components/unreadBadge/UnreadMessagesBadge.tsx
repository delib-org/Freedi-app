import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useUnreadMessageCount } from '@/controllers/hooks/useUnreadMessageCount';
import { translateCount } from '@/helpers/translateCount';
import UnreadBadge from './UnreadBadge';

interface UnreadMessagesBadgeProps {
	statementId: string;
	size?: 'small' | 'medium' | 'large';
	position?: 'absolute' | 'relative';
}

/**
 * The unread-messages number on a card: chat messages and answers below
 * `statementId` that this person has not seen. Renders nothing at 0, and
 * nothing for a card they never opened.
 */
const UnreadMessagesBadge: FC<UnreadMessagesBadgeProps> = ({
	statementId,
	size = 'small',
	position = 'relative',
}) => {
	const { t } = useTranslation();
	const count = useUnreadMessageCount(statementId);

	if (count <= 0) return null;

	return (
		<UnreadBadge
			count={count}
			size={size}
			position={position}
			ariaLabel={translateCount(t, 'unread.messageCount', count)}
		/>
	);
};

export default UnreadMessagesBadge;
