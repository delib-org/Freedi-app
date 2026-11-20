import m from 'mithril';
import type { LessonStatus, LessonStepKey, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { stepMoreContent } from '@/lib/classroom/stepMore';
import type { StepMoreDanger, StepMoreInput, StepMoreItem } from '@/lib/classroom/stepMore';
import type { CopyOffer } from '@/lib/classroom/registrationLogic';
import { tablesRegistrationUrl } from '@/lib/classroom/registrationLogic';
import { liveResultsOn, supportShownOn, voteOrderOf } from '@/lib/classroom/voteResults';
import { isBallotClosed, isBallotFrozen, isBallotPaused } from '@/lib/classroom/consoleHelpers';
import { askConfirm } from './ConfirmDialog';
import {
	allTablesNewTurn,
	allTablesTo,
	pauseBallot,
	setVoteDisplay,
	setVoteOrder,
	startPlenum,
} from './consoleActions';
import {
	confirmResetTurns,
	confirmResetVote,
	confirmResplit,
	confirmSkipVote,
} from './consoleConfirms';
import { consoleState, isBusy } from './consoleState';
import { requestSettingsOpen } from './ConsoleSettings';
import { Disclosure, closeDisclosure, openDisclosure } from './Disclosure';
import { LESSON_MORE_ID } from './LessonMore';
import { copySeating } from './registrationActions';
import {
	ResultsAudienceSwitch,
	SupportAudienceSwitch,
	VOTE_RESULTS_AUDIENCE,
} from './ResultsAudienceSwitch';
import { VoteOrderSwitch } from './VoteOrderSwitch';
import { VoteScopeSwitch } from './VoteScopeSwitch';
import { voteScopeOf } from './voteScopeState';

/**
 * "More for this step" (design 6.2): the step's secondary actions and its red ones, in a closed
 * panel beside the primary button. What is in it per step is decided by lib/classroom/stepMore.ts;
 * an empty menu is not drawn. Red items come last, after a divider, and each asks first.
 */

export const STEP_MORE_ID = 'step-more';

export interface StepMoreAttrs {
	mid: string;
	status: LessonStatus;
	stepKey: LessonStepKey;
	steps: readonly LessonStepKey[];
	challenge: Statement | null;
	main: Statement | null;
	hasTables: boolean;
	plenum: boolean;
	connected: boolean;
	registrationId?: string;
	copyOffer: CopyOffer;
}

function inputOf(attrs: StepMoreAttrs): StepMoreInput {
	return {
		status: attrs.status,
		stepKey: attrs.stepKey,
		hasTables: attrs.hasTables,
		hasChallenge: attrs.challenge !== null,
		connected: attrs.connected,
		canUpdateFromRegistration: attrs.copyOffer.kind === 'again',
		ballotFrozen: isBallotFrozen(attrs.challenge),
		ballotClosed: isBallotClosed(attrs.challenge),
	};
}

export function stepMoreVisible(attrs: StepMoreAttrs): boolean {
	const content = stepMoreContent(inputOf(attrs));

	return content.items.length + content.danger.length > 0;
}

function actionButton(
	label: string,
	onclick: () => void,
	extra: { disabled?: boolean; testId?: string } = {},
): m.Vnode {
	return m(
		'button.btn.btn--secondary.more-panel__item',
		{ type: 'button', disabled: extra.disabled === true, 'data-testid': extra.testId, onclick },
		label,
	);
}

function itemView(item: StepMoreItem, attrs: StepMoreAttrs, close: () => void): m.Children {
	const { challenge, mid } = attrs;
	const held = attrs.status !== 'live';
	const choiceBusy = (key: string): boolean => challenge === null || isBusy(key);
	switch (item) {
		case 'seats':
			return actionButton(
				`${t('console.table_size')}…`,
				() => {
					// Close this panel without handing focus back to its toggle: the settings take it.
					closeDisclosure(STEP_MORE_ID);
					// Open "More" only after this click has bubbled: its outside-click rule would
					// otherwise close it again, since this button is outside it.
					window.setTimeout(() => {
						openDisclosure(LESSON_MORE_ID);
						requestSettingsOpen();
					}, 0);
				},
				{ disabled: held, testId: 'console-seats' },
			);
		case 'updateFromRegistration':
			return actionButton(
				t('console.copy_seating.again'),
				() => {
					close();
					askConfirm({
						title: t('console.copy_seating.again_title'),
						body: t('console.copy_seating.again_body'),
						yesLabel: t('console.copy_seating.again_yes'),
						destructive: true,
						run: () => void copySeating(mid, true),
					});
				},
				{ disabled: held || isBusy('registration:copy'), testId: 'copy-seating' },
			);
		case 'manageRegistration':
			return attrs.registrationId
				? m(
						'a.btn.btn--secondary.more-panel__item',
						{
							href: tablesRegistrationUrl(attrs.registrationId),
							target: '_blank',
							rel: 'noopener',
						},
						t('console.register_ahead.manage'),
					)
				: null;
		case 'voteScope':
			return m(VoteScopeSwitch, {
				...voteScopeOf(
					challenge,
					attrs.main,
					challenge ? (consoleState.options.get(challenge.statementId) ?? []) : [],
				),
				disabled: choiceBusy('voteDisplay:onlyAboveGate'),
			});
		case 'voteScopeLocked':
			return m('p.more-panel__note', t('console.vote_scope_locked'));
		case 'voteOrder':
			return m(VoteOrderSwitch, {
				value: voteOrderOf(challenge),
				disabled: choiceBusy('voteDisplay:order'),
				onChange: (order) => {
					if (challenge) void setVoteOrder(challenge.statementId, order);
				},
			});
		case 'resultsAudience':
			return m(ResultsAudienceSwitch, {
				...VOTE_RESULTS_AUDIENCE,
				shown: liveResultsOn(challenge),
				disabled: choiceBusy('voteDisplay:liveResults'),
				onChange: (shown: boolean) => {
					if (challenge) void setVoteDisplay(challenge.statementId, 'liveResults', shown);
				},
			});
		case 'supportAudience':
			return m(SupportAudienceSwitch, {
				resultsShown: liveResultsOn(challenge),
				supportShown: supportShownOn(challenge),
				disabled: choiceBusy('voteDisplay:supportShown'),
				onChange: (shown: boolean) => {
					if (challenge) void setVoteDisplay(challenge.statementId, 'supportShown', shown);
				},
			});
		case 'pauseVote': {
			const paused = isBallotPaused(challenge);

			return actionButton(
				t(paused ? 'console.resume_vote' : 'console.pause_vote'),
				() => {
					close();
					void pauseBallot(mid, !paused);
				},
				{ disabled: held || isBusy('pauseVote'), testId: 'console-pause-vote' },
			);
		}
		case 'skipVote':
			return actionButton(
				t('console.vote_skip'),
				() => {
					close();
					confirmSkipVote(mid, attrs.steps.indexOf('summary'));
				},
				{ disabled: held, testId: 'console-skip-vote' },
			);
		case 'allTablesRate':
			return actionButton(
				t('console.all_tables_rate'),
				() => {
					close();
					void allTablesTo(mid, 'rate');
				},
				{ disabled: held || isBusy('all:rate'), testId: 'console-all-rate' },
			);
		case 'anotherTurnAll':
			return actionButton(
				t('console.another_turn_all'),
				() => {
					close();
					void allTablesNewTurn(mid);
				},
				{
					disabled: held || !attrs.hasTables || isBusy('all:newTurn'),
					testId: 'console-all-new-turn',
				},
			);
		case 'plenum':
			return actionButton(
				t(attrs.plenum ? 'console.plenum_on' : 'console.plenum'),
				() => {
					close();
					if (challenge) void startPlenum(challenge.statementId);
				},
				{
					disabled: held || attrs.plenum || challenge === null || isBusy('plenum'),
					testId: 'console-plenum',
				},
			);
	}
}

function dangerView(danger: StepMoreDanger, attrs: StepMoreAttrs, close: () => void): m.Vnode {
	const ended = attrs.status === 'ended';
	if (danger === 'resetVote') {
		const canReset = isBallotClosed(attrs.challenge) || isBallotPaused(attrs.challenge);

		return m('div.more-panel__danger-item', [
			m(
				'button.btn.btn--danger-outline.more-panel__item',
				{
					type: 'button',
					'aria-disabled': canReset ? undefined : 'true',
					'aria-describedby': canReset ? undefined : 'vote-reset-hint',
					disabled: ended || isBusy('reset:vote'),
					'data-testid': 'console-reset-vote',
					onclick: () => {
						if (!canReset) return;
						close();
						confirmResetVote(attrs.mid);
					},
				},
				t('console.reset_vote'),
			),
			canReset ? null : m('p.more-panel__note#vote-reset-hint', t('console.vote_reset_hint')),
		]);
	}
	const isResplit = danger === 'resplit';
	// Dividing again goes through the held guard: paused, it would do nothing and say nothing.
	const heldBlock = isResplit && attrs.status === 'paused';

	return m('div.more-panel__danger-item', [
		m(
			'button.btn.btn--danger-outline.more-panel__item',
			{
				type: 'button',
				'aria-disabled': heldBlock ? 'true' : undefined,
				'aria-describedby': heldBlock ? 'resplit-held-hint' : undefined,
				disabled: ended || isBusy(isResplit ? 'assign' : 'reset:turns:all'),
				'data-testid': isResplit ? 'console-resplit' : 'console-reset-turns',
				onclick: () => {
					if (heldBlock) return;
					close();
					if (isResplit) confirmResplit(attrs.mid);
					else confirmResetTurns(attrs.mid);
				},
			},
			t(isResplit ? 'console.resplit' : 'console.reset_turns_all'),
		),
		heldBlock ? m('p.more-panel__note#resplit-held-hint', t('console.act_for_held')) : null,
	]);
}

export const StepMore: m.Component<StepMoreAttrs> = {
	view({ attrs }) {
		const content = stepMoreContent(inputOf(attrs));
		if (content.items.length + content.danger.length === 0) return null;

		return m(Disclosure, {
			id: STEP_MORE_ID,
			label: t('console.step_more'),
			// The toggle is the last control of the action band: the panel opens toward the start.
			align: 'end',
			testId: 'console-step-more',
			panelLabel: t('console.step_more'),
			content: (close: () => void) => [
				attrs.status === 'paused' ? m('p.more-panel__note', t('lesson.paused.title')) : null,
				...content.items.map((item) => m('div.more-panel__row', itemView(item, attrs, close))),
				content.danger.length > 0
					? m(
							'div.more-panel__danger',
							content.danger.map((danger) =>
								m('div.more-panel__row', dangerView(danger, attrs, close)),
							),
						)
					: null,
			],
		});
	},
};
