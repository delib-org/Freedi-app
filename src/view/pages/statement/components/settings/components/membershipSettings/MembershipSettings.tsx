import { FC, useState } from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Access, Statement } from 'delib-npm';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import { updateStatement } from '@/controllers/db/statements/setStatements';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';

interface Props {
	statement: Statement;
}

const MembershipSettings: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();

	const [membershipAccess, setMembershipAccess] = useState<Access>(statement?.membership?.access ?? Access.openToAll);

	if (!statement) return null;

	return (
		<div>
			<SectionTitle title={t('Membership Settings')} />
			<MultiSwitch
				options={[
					{
						label: t('Open to all'),
						toolTip: t('Anyone can join the group'),
						value: Access.openToAll,
					},
					{
						label: t('Open for registered members'),
						toolTip: t('Only registered members can join the group'),
						value: Access.openForRegistered,
					},
					{
						label: t('Moderated'),
						toolTip: t('Only approved members can join the group'),
						value: Access.moderated,
					},
					{
						label: t('Secret'),
						toolTip: t('Only the creator can add members'),
						value: Access.secret,
					}
				]}
				currentValue={membershipAccess}
				onClick={(newValues) => {
					setMembershipAccess(newValues as Access)
					setStatementMembership({ statement, membershipAccess: newValues as Access })
				}}
			/>
		</div>
	)
}

export default MembershipSettings