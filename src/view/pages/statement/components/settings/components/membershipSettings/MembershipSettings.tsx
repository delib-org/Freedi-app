import { FC, useState } from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Access, Statement } from 'delib-npm';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';

interface Props {
	statement: Statement;
}

const MembershipSettings: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();

	const [membershipAccess, setMembershipAccess] = useState<Access>(statement?.membership?.access ?? Access.openToAll);

	if (!statement) return null;

	console.log("access", Access)

	return (
		<div>
			<SectionTitle title={t('Group Settings')} />
			<MultiSwitch
				options={[
					{
						label: t('Allow everyone to join the group'),
						value: Access.openToAll,
					},
					{
						label: t('Allow registered members to join the group'),
						value: Access.openForRegistered,
					},
					{
						label: t('Allow only approved members to join the group'),
						value: Access.moderated,
					},
					{
						label: t('Only the creator can add members'),
						value: Access.secret,
					}
				]}
				currentValue={membershipAccess}
				onClick={(newValues) => {
					console.log("newValues", newValues)
					setMembershipAccess(newValues as Access)
				}}
			/>
		</div>
	)
}

export default MembershipSettings