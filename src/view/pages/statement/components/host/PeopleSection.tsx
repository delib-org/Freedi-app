import { FC } from 'react';
import { Access, Statement, StatementType } from '@freedi/shared-types';
import MembershipSettings from '../settings/components/membershipSettings/MembershipSettings';
import MembersSettings from '../settings/components/membership/MembersSettings';
import AdminsManagement from '../settings/components/membership/AdminsManagement/AdminsManagement';
import MemberValidation from '../settings/components/memberValidation/MemberValidation';
import UserDemographicSetting from '../settings/components/UserDemographicSettings/UserDemographicSetting';
import MembersManagement from '../settings/components/membership/MembersManagement';
import { OptionRooms } from '../settings/components/optionRooms';
import ConfidenceIndexSettings from '../settings/components/QuestionSettings/ConfidenceIndexSettings';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { resolveEffectiveAccess } from '@/helpers/effectiveAccess';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import WaitingSubsection from './people/WaitingSubsection';
import { usePeopleAnchors } from './people/usePeopleAnchors';
import { useStatementWaitingList } from './people/useStatementWaitingList';
import { useWaitingDecisions } from './people/useWaitingDecisions';
import { PeopleAnchor } from './hostHubLogic';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';
import styles from './HostHub.module.scss';

const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface PeopleSectionProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

/**
 * Who can join, who is waiting, who hosts, who is banned, the entry check,
 * demographic questions, breakout rooms and the stakeholder count — every people-shaped control the
 * settings page used to spread over three groups. Subsections move onto
 * PeopleSubsection anchors phase by phase (docs/ux/main-people-settings-ux.md §9);
 * Waiting to join (#waiting) is the first.
 */
const PeopleSection: FC<PeopleSectionProps> = ({ statement, setStatementToEdit }) => {
	const { t } = useTranslation();
	const isQuestion = statement.statementType === StatementType.question;
	const topParent = useAppSelector(statementSelector(statement.topParentId));
	const waitingList = useStatementWaitingList(statement.statementId);
	const decisions = useWaitingDecisions(waitingList);

	// IA §7: Waiting shows when someone waits, or when access is By approval.
	const isByApproval = resolveEffectiveAccess(statement, topParent) === Access.moderated;
	const hasWaiting = decisions.visible.length > 0;
	const available: PeopleAnchor[] = hasWaiting || isByApproval ? ['waiting'] : [];
	const anchors = usePeopleAnchors({ available, defaultOpen: hasWaiting ? 'waiting' : null });

	return (
		<div className={groupWrapClass} data-testid="host-people">
			<MembershipSettings statement={statement} setStatementToEdit={setStatementToEdit} />
			{available.includes('waiting') && (
				<WaitingSubsection
					decisions={decisions}
					isOpen={anchors.isOpen('waiting')}
					onToggle={anchors.toggle}
					toggleRef={anchors.registerToggle('waiting')}
				/>
			)}
			<MembersSettings statement={statement} />
			<AdminsManagement statement={statement} />
			{isQuestion && <MemberValidation statement={statement} />}
			<UserDemographicSetting statement={statement} />
			<MembersManagement statement={statement} />
			<OptionRooms statement={statement} />
			<h3 className={styles.subheading}>{t('host.people.stakeholders')}</h3>
			{/* Not gated to questions: a group declares its stakeholders once and
			    every question beneath it inherits the number. */}
			<ConfidenceIndexSettings statement={statement} />

			{decisions.toast && (
				<ActionToast
					key={decisions.toast.id}
					message={decisions.toast.message}
					actionLabel={decisions.toast.actionLabel}
					onAction={decisions.toast.onAction}
					durationMs={decisions.toast.durationMs}
					onDismiss={decisions.dismissToast}
				/>
			)}
		</div>
	);
};

export default PeopleSection;
