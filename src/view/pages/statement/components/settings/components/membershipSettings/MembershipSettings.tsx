import { FC, useState } from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { Access, Statement } from 'delib-npm';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import { setStatementMembership } from '@/controllers/db/statements/setStatementMembership';

interface Props {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

const MembershipSettings: FC<Props> = ({ statement, setStatementToEdit }) => {
	const { t } = useUserConfig();

	const [membershipAccess, setMembershipAccess] = useState<Access>(statement?.membership?.access ?? Access.openToAll);

	if (!statement) return null;
	if (statement.parentId !== 'top') return null; // Only top-level statements can have membership settings

	return (
		<div>
			<SectionTitle title={t('Membership Settings')} />
			<MultiSwitch
				options={[
					{
						label: t('Public'),
						toolTip: t('Anyone can view and interact with the statement'),
						value: Access.public,
					},
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
					}
				]}
				currentValue={membershipAccess}
				onClick={(newValues) => {
					setMembershipAccess(newValues as Access)
					//in case of a new statement, we need to set the membership access in the statement object
					if (statement.statementId === "") {
						setStatementToEdit({
							...statement,
							membership: {
								...statement.membership,
								access: newValues as Access
							}
						})
					} else {
						setStatementMembership({ statement, membershipAccess: newValues as Access })
					}
				}}
			/>
		</div>
	)
}

export default MembershipSettings