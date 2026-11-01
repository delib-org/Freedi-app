import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Access, Statement, StatementType } from '@freedi/shared-types';
import MembershipSettings from '../settings/components/membershipSettings/MembershipSettings';
import MemberValidation from '../settings/components/memberValidation/MemberValidation';
import UserDemographicSetting from '../settings/components/UserDemographicSettings/UserDemographicSetting';
import ConfidenceIndexSettings from '../settings/components/QuestionSettings/ConfidenceIndexSettings';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import PeopleSubsection from '@/view/components/atomic/molecules/PeopleSubsection';
import JoiningSubsection from './people/JoiningSubsection';
import WaitingSubsection from './people/WaitingSubsection';
import MembersSubsection from './people/MembersSubsection';
import PeopleJumpStrip, { JumpTarget } from './people/PeopleJumpStrip';
import { countPeople } from './people/membersLogic';
import { isNewSpace, pickDefaultOpen, visiblePeopleAnchors } from './people/peopleLayout';
import { useEntryCheck } from './people/useEntryCheck';
import { useJoinQuestionCounts } from './people/useJoinQuestionCounts';
import { useMembersPaging } from './people/useMembersPaging';
import { usePeopleAnchors } from './people/usePeopleAnchors';
import { usePeopleSummaries } from './people/usePeopleSummaries';
import { usePeopleToast } from './people/usePeopleToast';
import { useStatementMembers } from './people/useStatementMembers';
import { useStatementWaitingList } from './people/useStatementWaitingList';
import { useWaitingDecisions } from './people/useWaitingDecisions';
import { PeopleAnchor } from './hostHubLogic';
import styles from './PeopleSection.module.scss';

interface PeopleSectionProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

/** Title key per subsection, shared by the headers and the jump strip. */
const TITLE_KEY: Record<PeopleAnchor, string> = {
	join: 'people.whoCanJoin',
	waiting: 'people.waiting',
	members: 'people.members',
	questions: 'people.joinQuestions',
	'entry-check': 'people.entryCheck',
	stakeholders: 'host.people.stakeholders',
	joining: 'people.joiningAndRooms',
};

/**
 * People: who can join, who is waiting, the members, the questions on
 * joining and their entry check, the stakeholder count and (questions only)
 * joining answers & rooms — one accordion of PeopleSubsections with live
 * summaries and #anchors (docs/ux/main-people-settings-ux.md §3, §4.1).
 * Both the Host hub and the legacy settings page render this one section.
 */
const PeopleSection: FC<PeopleSectionProps> = ({ statement, setStatementToEdit }) => {
	const { t } = useTranslation();
	const { statementId } = statement;
	const isQuestion = statement.statementType === StatementType.question;
	const waitingList = useStatementWaitingList(statementId);
	const members = useStatementMembers(statementId);
	const membersPaging = useMembersPaging(statementId, members);
	const toaster = usePeopleToast();
	const decisions = useWaitingDecisions(waitingList, toaster);
	const questionCounts = useJoinQuestionCounts(statement);
	const hasJoinQuestions = questionCounts.asked > 0;
	const entryCheck = useEntryCheck(statementId, hasJoinQuestions);
	const toReview = entryCheck.counts.pending;
	const summaries = usePeopleSummaries({ statement, questionCounts, toReviewCount: toReview });
	const announcement = useAnnouncer();
	const { toast } = toaster;

	const waitingCount = decisions.visible.length;
	const memberCount =
		membersPaging.hasMoreOnServer && membersPaging.total !== null
			? membersPaging.total
			: countPeople(members, statement.creator?.uid);
	const available = visiblePeopleAnchors({
		isQuestion,
		// IA §7: Waiting shows when someone waits, or when access is By approval.
		showWaiting: waitingCount > 0 || summaries.access === Access.moderated,
		hasJoinQuestions,
	});
	const anchors = usePeopleAnchors({
		available,
		defaultOpen: pickDefaultOpen({
			available,
			waitingCount,
			toReviewCount: toReview,
			isNewSpace: isNewSpace(membersPaging.total),
		}),
	});
	useAnnounceChange(waitingCount, announcement.announce, (count) =>
		fillPlaceholders(t('people.waitingCount'), { count }),
	);

	const jumpTargets: JumpTarget[] = available.map((anchor) => ({
		anchor,
		label: t(TITLE_KEY[anchor]),
		...jumpCount(anchor, { waitingCount, toReview, memberCount, questions: questionCounts.asked }),
	}));

	const subsection = (anchor: PeopleAnchor) => ({
		id: anchor,
		title: t(TITLE_KEY[anchor]),
		isOpen: anchors.isOpen(anchor),
		onToggle: anchors.toggle,
		toggleRef: anchors.registerToggle(anchor),
	});

	return (
		<div className={styles.peopleSection} data-testid="host-people">
			<PeopleJumpStrip targets={jumpTargets} onJump={anchors.jumpTo} />
			<p className={styles.live} aria-live="polite" data-testid="people-live">
				{announcement.message}
			</p>

			<PeopleSubsection {...subsection('join')} summary={summaries.join}>
				<MembershipSettings statement={statement} setStatementToEdit={setStatementToEdit} />
			</PeopleSubsection>
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
				paging={membersPaging}
				onAnnounce={announcement.announce}
				isOpen={anchors.isOpen('members')}
				onToggle={anchors.toggle}
				toggleRef={anchors.registerToggle('members')}
			/>
			<PeopleSubsection {...subsection('questions')} summary={summaries.questions}>
				<UserDemographicSetting statement={statement} />
			</PeopleSubsection>
			{available.includes('entry-check') && (
				<PeopleSubsection
					{...subsection('entry-check')}
					summary={summaries.entryCheck}
					count={toReview}
					countLabel={fillPlaceholders(t('people.toReview'), { count: toReview })}
				>
					<MemberValidation statement={statement} entryCheck={entryCheck} />
				</PeopleSubsection>
			)}
			{/* Not gated to questions: a group declares its stakeholders once and
			    every question beneath it inherits the number. */}
			<PeopleSubsection {...subsection('stakeholders')} summary={summaries.stakeholders}>
				<ConfidenceIndexSettings statement={statement} />
			</PeopleSubsection>
			{available.includes('joining') && (
				<JoiningSubsection
					statement={statement}
					summary={summaries.joining}
					isOpen={anchors.isOpen('joining')}
					onToggle={anchors.toggle}
					toggleRef={anchors.registerToggle('joining')}
				/>
			)}

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

interface JumpCounts {
	waitingCount: number;
	toReview: number;
	memberCount: number;
	questions: number;
}

/** Waiting and Entry check count work to do; Questions counts what is asked. */
function jumpCount(
	anchor: PeopleAnchor,
	{ waitingCount, toReview, memberCount, questions }: JumpCounts,
): Pick<JumpTarget, 'count' | 'needsAttention'> {
	if (anchor === 'waiting') return { count: waitingCount, needsAttention: waitingCount > 0 };
	if (anchor === 'entry-check') return { count: toReview, needsAttention: toReview > 0 };
	if (anchor === 'members') return { count: memberCount };
	if (anchor === 'questions') return { count: questions };

	return {};
}

interface Announcer {
	message: string;
	announce: (message: string) => void;
}

/** The one polite live region's text (UX §7). */
function useAnnouncer(): Announcer {
	const [message, setMessage] = useState('');
	const announce = useCallback((next: string) => setMessage(next), []);

	return { message, announce };
}

/** Announces a count when it changes after the first render (not on mount). */
function useAnnounceChange(
	count: number,
	announce: (message: string) => void,
	format: (count: number) => string,
): void {
	const previous = useRef(count);
	useEffect(() => {
		if (previous.current === count) return;
		previous.current = count;
		announce(format(count));
	}, [count, announce, format]);
}

export default PeopleSection;
