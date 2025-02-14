import { FC } from 'react';
import Chip from '@/view/components/chip/Chip';
import './MembersChipList.scss';
import { User } from '@/types/user/User';

interface MembersChipsListProps {
	members: User[];
}

const MembersChipsList: FC<MembersChipsListProps> = ({ members }) => {
	return (
		<div className='members-chips-list'>
			{members.map((member) => {
				return <Chip key={member.uid} user={member} />;
			})}
		</div>
	);
};

export default MembersChipsList;
