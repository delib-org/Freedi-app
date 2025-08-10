import { FC } from 'react';
import Chip from '@/view/components/chip/Chip';
import styles from './MembersChipList.module.scss';
import { User } from 'delib-npm';

interface MembersChipsListProps {
	members: User[];
}

const MembersChipsList: FC<MembersChipsListProps> = ({ members }) => {
	return (
		<div className={styles.membersChipsList}>
			{members.map((member) => {
				return <Chip key={member.uid} user={member} />;
			})}
		</div>
	);
};

export default MembersChipsList;
