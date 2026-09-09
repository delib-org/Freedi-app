import { FC } from 'react';
import { Statement, StatementType } from '@freedi/shared-types';
import MembershipSettings from '../settings/components/membershipSettings/MembershipSettings';
import MembersSettings from '../settings/components/membership/MembersSettings';
import AdminsManagement from '../settings/components/membership/AdminsManagement/AdminsManagement';
import MemberValidation from '../settings/components/memberValidation/MemberValidation';
import UserDemographicSetting from '../settings/components/UserDemographicSettings/UserDemographicSetting';
import MembersManagement from '../settings/components/membership/MembersManagement';
import { OptionRooms } from '../settings/components/optionRooms';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';

const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface PeopleSectionProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

/**
 * Who can join, who is waiting, who hosts, who is banned, the entry check,
 * demographic questions, and breakout rooms — every people-shaped control the
 * settings page used to spread over three groups.
 */
const PeopleSection: FC<PeopleSectionProps> = ({ statement, setStatementToEdit }) => {
	const isQuestion = statement.statementType === StatementType.question;

	return (
		<div className={groupWrapClass} data-testid="host-people">
			<MembershipSettings statement={statement} setStatementToEdit={setStatementToEdit} />
			<MembersSettings statement={statement} />
			<AdminsManagement statement={statement} />
			{isQuestion && <MemberValidation statement={statement} />}
			<UserDemographicSetting statement={statement} />
			<MembersManagement statement={statement} />
			<OptionRooms statement={statement} />
		</div>
	);
};

export default PeopleSection;
