import { FC } from 'react';
import { Access, Statement, StatementType } from '@freedi/shared-types';
import MembershipSettings from '../settings/components/membershipSettings/MembershipSettings';
import MemberValidation from '../settings/components/memberValidation/MemberValidation';
import UserDemographicSetting from '../settings/components/UserDemographicSettings/UserDemographicSetting';
import { OptionRooms } from '../settings/components/optionRooms';
import ConfidenceIndexSettings from '../settings/components/QuestionSettings/ConfidenceIndexSettings';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { resolveEffectiveAccess } from '@/helpers/effectiveAccess';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import WaitingSubsection from './people/WaitingSubsection';
import MembersSubsection from './people/MembersSubsection';
import { usePeopleAnchors } from './people/usePeopleAnchors';
import { usePeopleToast } from './people/usePeopleToast';
import { useStatementMembers } from './people/useStatementMembers';
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
 * PeopleSubsection anchors phase by phase (docs/ux/main-people-settings-ux.md §9):
 * Waiting to join (#waiting) and Members (#members) so far. Both the Host hub
 * and the legacy settings page render this one section.
 */
const PeopleSection: FC<PeopleSectionProps> = ({ statement, setStatementToEdit }) => {
	const { t } = useTranslation();
	const isQuestion = statement.statementType === StatementType.question;
	const topParent = useAppSelector(statementSelector(statement.topParentId));
	const waitingList = useStatementWaitingList(statement.statementId);
	const members = useStatementMembers(statement.statementId);
	const toaster = usePeopleToast();
	const decisions = useWaitingDecisions(waitingList, toaster);
	const { toast } = toaster;

	// IA §7: Waiting shows when someone waits, or when access is By approval.
	const isByApproval = resolveEffectiveAccess(statement, topParent) === Access.moderated;
	const hasWaiting = decisions.visible.length > 0;
	const available: PeopleAnchor[] =
		hasWaiting || isByApproval ? ['waiting', 'members'] : ['members'];
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
			<MembersSubsection
				statement={statement}
				members={members}
				decisions={decisions}
				toaster={toaster}
				isOpen={anchors.isOpen('members')}
				onToggle={anchors.toggle}
				toggleRef={anchors.registerToggle('members')}
			/>
			{isQuestion && <MemberValidation statement={statement} />}
			<UserDemographicSetting statement={statement} />
			<OptionRooms statement={statement} />
			<h3 className={styles.subheading}>{t('host.people.stakeholders')}</h3>
			{/* Not gated to questions: a group declares its stakeholders once and
			    every question beneath it inherits the number. */}
			<ConfidenceIndexSettings statement={statement} />

			{toast && (
				<ActionToast
					key={toast.id}
					message={toast.message}
					actionLabel={toast.actionLabel}
					onAction={toast.onAction}
					durationMs={toast.durationMs}
					onDismiss={toaster.dismiss}
				/>
			)}
		</div>
	);
};

export default PeopleSection;
