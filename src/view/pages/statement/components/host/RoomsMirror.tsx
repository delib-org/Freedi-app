import { FC } from 'react';
import { Link } from 'react-router';
import { DoorOpen } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { useActiveRoomCount } from '../settings/components/optionRooms/useActiveRoomCount';
import { buildPeopleAnchorPath } from './hostHubLogic';
import styles from './HostHub.module.scss';

interface RoomsMirrorProps {
	statement: Statement;
}

/**
 * One read-only line in Answers once rooms exist: "Rooms: 4 · manage in
 * People" (UX §8 Q2). The rooms themselves stay under People #joining.
 */
const RoomsMirror: FC<RoomsMirrorProps> = ({ statement }) => {
	const { t } = useTranslation();
	const isJoiningOn = statement.statementSettings?.joiningEnabled ?? false;
	const rooms = useActiveRoomCount(statement.statementId, isJoiningOn);

	if (rooms === 0) return null;

	return (
		<Link
			className={styles.linkButton}
			to={buildPeopleAnchorPath(statement.statementId, 'joining')}
			data-testid="answers-rooms-mirror"
		>
			<DoorOpen size={16} aria-hidden="true" />
			{fillPlaceholders(t('people.rooms.mirror'), { count: rooms })}
		</Link>
	);
};

export default RoomsMirror;
