import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { ensureUser, signInWithGoogle, getUserState } from '@/lib/user';
import {
	loadQuestion,
	primeQuestionFromCache,
	getQuestion,
	getVisibleOptions,
	getOrganizerSuggestions,
	getOptionById,
	subscribeOptions,
	subscribeQuestion,
	subscribeMainStatement,
	getMainIdForQuestion,
	subscribeUserEvaluations,
	subscribeUserJoinFormSubmission,
	getUnreadCount,
	getTotalVisibleCount,
	getNewOptionsPendingCount,
	flushNewOptions,
	isOptionNewlyArrived,
} from '@/lib/store';
import { isAdmin, checkAdminStatus } from '@/lib/admin';
import { markOpenedInJoin } from '@/lib/joinSubscriptions';
import { t } from '@/lib/i18n';
import { isFacilitatedMode } from '@/lib/facilitator';
import { SolutionCard } from '@/components/SolutionCard';
import { JoinFormModal } from '@/components/JoinFormModal';
import { LimitReachedModal } from '@/components/LimitReachedModal';
import { AddSuggestionModal } from '@/components/AddSuggestionModal';
import { EditSuggestionModal } from '@/components/EditSuggestionModal';
import { FacilitatorPanel } from '@/components/FacilitatorPanel';
import { BackButton } from '@/components/BackButton';
import { WizColFooter } from '@/components/WizColFooter';
import { EditableTitle } from '@/components/EditableTitle';
import { SplashLoader } from '@/views/Splash';
import { captureFlipPositions, playFlipAnimation } from '@/lib/flipAnimate';
import type { Unsubscribe } from '@/lib/firebase';

let loading = true;
let error: string | null = null;
let questionUnsub: Unsubscribe | null = null;
let optionsUnsub: Unsubscribe | null = null;
let mainUnsub: Unsubscribe | null = null;
let evaluationsUnsub: Unsubscribe | null = null;
let joinSubmissionUnsub: Unsubscribe | null = null;
// The question id this Solutions instance is currently subscribed for. Mithril
// 2 reuses a component instance when the URL changes to the same route shape
// (e.g. follow-me from `/m/X/q/A` to `/m/X/q/B`), so `oninit` doesn't run a
// second time. We compare the URL param against `currentQuestionId` on every
// update tick and re-init the subscriptions when they diverge — that's what
// actually swaps the rendered question.
let currentQuestionId: string | null = null;
let showJoinForm = false;
let pendingJoinOptionId: string | null = null;
let pendingJoinRole: 'activist' | 'organizer' = 'activist';
// Limit-reached swap modal state — set when the user clicks join on a fresh
// option but is already at the per-user cap. They pick one of `limitCurrentJoins`
// to release, and `toggleJoining` swaps atomically.
let showLimitSwap = false;
let limitPendingOptionId: string | null = null;
let limitPendingOptionTitle = '';
let limitPendingRole: 'activist' | 'organizer' = 'activist';
let limitCurrentJoins: Statement[] = [];
let adminMode = false;
let showAddSuggestion = false;
// Tracks which mode the modal opened in. Admins can open it as either an
// organizer (badged Cloud Function path) or as a regular participant (crowd
// list, no badge), so the modal needs to know which path to take.
let addAsOrganizer = false;
// When non-null, the edit modal is open for this option id. We re-resolve the
// option from the store on every render so the modal sees fresh state if the
// snapshot changes mid-edit.
let editingOptionId: string | null = null;
// Captured at `onbeforeupdate` of `.solutions__list`, replayed at `onupdate`
// to drive the FLIP reorder animation.
let capturedListRects: Map<string, DOMRect> | null = null;

function teardownSolutionsSubscriptions(): void {
	if (questionUnsub) {
		questionUnsub();
		questionUnsub = null;
	}
	if (optionsUnsub) {
		optionsUnsub();
		optionsUnsub = null;
	}
	if (mainUnsub) {
		mainUnsub();
		mainUnsub = null;
	}
	if (evaluationsUnsub) {
		evaluationsUnsub();
		evaluationsUnsub = null;
	}
	if (joinSubmissionUnsub) {
		joinSubmissionUnsub();
		joinSubmissionUnsub = null;
	}
}

async function initSolutionsForQuestion(questionId: string): Promise<void> {
	// Re-entrant by design: when the route param changes under us (follow-me
	// to a sibling sub-question), we drop the previous subscriptions and rebuild
	// for the new question. Without this, Mithril's component-instance reuse
	// would leave the participant looking at the previous question.
	teardownSolutionsSubscriptions();
	currentQuestionId = questionId;
	error = null;

	// When the user lands here via the hub (the typical facilitated path),
	// the sub-question Statement is already in `store.subQuestions[]` from
	// `subscribeSubQuestions`. Hand it to the active question slot so the
	// header renders immediately — no splash screen between hub click and
	// solutions view. Options still stream in via `subscribeOptions` below
	// (the page just shows an empty list for one frame instead of a splash).
	const primed = primeQuestionFromCache(questionId);
	loading = !primed;
	if (primed) m.redraw();

	try {
		await ensureUser();
		// Bail if the participant has navigated again while we were awaiting:
		// the next init has already taken over and we'd otherwise double-write
		// the unsub slots.
		if (currentQuestionId !== questionId) return;
		// Skip the upfront `loadQuestion` round-trip when we primed from
		// cache — `subscribeQuestion` will deliver a fresh snapshot within
		// a frame, and `subscribeOptions` populates the list. For a cold
		// open (deep link, refresh) we still need the awaited fetch so the
		// view has data to render before the first snapshot arrives.
		if (!primed) {
			await loadQuestion(questionId);
			if (currentQuestionId !== questionId) return;
		}
		questionUnsub = subscribeQuestion(questionId);
		optionsUnsub = subscribeOptions(questionId);
		evaluationsUnsub = subscribeUserEvaluations(questionId);
		joinSubmissionUnsub = subscribeUserJoinFormSubmission(questionId);

		let mainId: string | undefined = m.route.param('mid');
		if (!mainId) {
			const derivedMainId = getMainIdForQuestion(getQuestion());
			if (derivedMainId) mainId = derivedMainId;
		}
		if (mainId) {
			mainUnsub = subscribeMainStatement(mainId);
		}

		const opened = getQuestion();
		if (opened && opened.parentId === 'top' && isAdmin()) {
			const user = getUserState().user;
			if (user) {
				void markOpenedInJoin(opened, user.uid, user.displayName ?? '').catch((err) => {
					console.error('[Solutions] markOpenedInJoin failed:', err);
				});
			}
		}
	} catch (err) {
		console.error('[Solutions] Failed to load:', err);
		error = t('solutions.error.failed');
	} finally {
		if (currentQuestionId === questionId) {
			loading = false;
			m.redraw();
		}
	}
}

export const Solutions: m.Component = {
	async oninit() {
		const questionId = m.route.param('qid');
		if (!questionId) {
			error = t('solutions.error.no_id');
			loading = false;
			currentQuestionId = null;
			m.redraw();

			return;
		}
		await initSolutionsForQuestion(questionId);
	},

	onbeforeupdate() {
		// Mithril reuses this component instance when the URL changes from one
		// `/m/:mid/q/:qid` to another. Detect a qid change and re-init for the
		// new question — this is what makes follow-me actually swap the page.
		const questionId = m.route.param('qid');
		if (questionId && questionId !== currentQuestionId) {
			void initSolutionsForQuestion(questionId);
		}

		return true;
	},

	onremove() {
		teardownSolutionsSubscriptions();
		currentQuestionId = null;
	},

	view() {
		if (loading) {
			return m(SplashLoader);
		}

		if (error) {
			return m('.solutions', m('.solutions__empty', error));
		}

		const question = getQuestion();
		if (!question) {
			return m('.solutions', m('.solutions__empty', t('solutions.error.not_found')));
		}

		const options = getVisibleOptions();
		const total = getTotalVisibleCount();
		const unread = getUnreadCount();
		const pendingCount = getNewOptionsPendingCount();
		const accentColor = question.color || 'var(--terra-500)';
		const facilitated = isFacilitatedMode();
		const mainId = m.route.param('mid');
		// Participants can add their own option whenever the admin has the
		// `enableAddEvaluationOption` toggle on (mirrors main app: same setting,
		// same modal, same store path). The facilitated route (/m/:mid/q/:qid)
		// doesn't change this — the toggle is the single source of truth for
		// "can people add options to this question".
		const addOptionEnabled = question.statementSettings?.enableAddEvaluationOption === true;
		const showUserAddButton = addOptionEnabled && !isAdmin();
		// Admin always gets the participant-style add button alongside the
		// organizer one — they can seed the crowd list "as a regular person"
		// regardless of whether participants are allowed to add.
		const showAdminParticipantAdd = isAdmin();

		return m(`.solutions${facilitated ? '.solutions--facilitated' : ''}`, [
			// Admin gets a return path: in facilitated mode that's the workspace
			// hub; otherwise (e.g. a question created from /, or a /q share link
			// opened by its admin) it's the join app's main page. The BackButton
			// self-gates on `isAdmin()`, so participants don't see it either way.
			m(BackButton, { to: facilitated && mainId ? `/m/${mainId}` : '/' }),
			m('.solutions__header', { style: `--q-accent: ${accentColor}` }, [
				m(EditableTitle, {
					statementId: question.statementId,
					value: question.statement,
					canEdit: isAdmin(),
					as: 'h1',
					className: 'solutions__title',
				}),
				pendingCount > 0
					? m(
							'button.solutions__new-pill',
							{
								onclick: flushNewOptions,
								'aria-live': 'polite',
								'aria-label':
									pendingCount === 1
										? t('solutions.new_answers')
										: t('solutions.new_answers_plural', { count: pendingCount }),
							},
							[
								m('span.solutions__new-pill-arrow', '↑'),
								m(
									'span',
									pendingCount === 1
										? t('solutions.new_answers')
										: t('solutions.new_answers_plural', { count: pendingCount }),
								),
							],
						)
					: null,
			]),
			m('.solutions__scroll', [
				question.statementSettings?.showJoining !== false
					? m('.solutions__subtitle', [
							m('span.solutions__subtitle-icon', '\u2728'),
							m('span', buildSubtitleText(question)),
						])
					: null,
				question.statementSettings?.showEvaluation === true
					? m('.solutions__subtitle', [
							m('span.solutions__subtitle-icon', '\u2728'),
							m('span', t('solutions.subtitle.evaluate')),
						])
					: null,
				m('.solutions__counter', [
					m('span.solutions__counter-total', t('solutions.counter.options', { count: total })),
					unread > 0
						? m('span.solutions__counter-unread', t('solutions.counter.new', { count: unread }))
						: null,
				]),
				isAdmin()
					? m('.solutions__admin-toolbar', [
							// Admin can always add an organizer suggestion — it goes
							// through the `createOrganizerSuggestion` Cloud Function,
							// which doesn't depend on the participant-facing
							// `enableAddEvaluationOption` toggle. Available in
							// facilitated mode too: the FacilitatorPanel doesn't
							// expose this action, and admins still need to seed the
							// list while leading the room.
							m(
								'button.btn.btn--small.btn--outline-organizer',
								{
									onclick: () => {
										addAsOrganizer = true;
										showAddSuggestion = true;
									},
								},
								t('admin.add_suggestion'),
							),
							// Admin's "as a regular participant" path — same crowd-list
							// path participants use, no organizer badge. Treated as the
							// primary action because seeding the people's list is the
							// expected default for admins; the organizer-section path
							// is the secondary, more deliberate choice.
							showAdminParticipantAdd
								? m(
										'button.btn.btn--small.btn--primary',
										{
											onclick: () => {
												addAsOrganizer = false;
												showAddSuggestion = true;
											},
										},
										t('solutions.add_suggestion'),
									)
								: null,
							// "Manage options" toggles per-card admin controls. Those
							// controls are suppressed by `displayOnly` in facilitated
							// mode, so the toggle would be a no-op there — hide it.
							facilitated
								? null
								: m(
										`button.btn.btn--small${adminMode ? '.btn--primary' : '.btn--outline'}`,
										{
											onclick: () => {
												adminMode = !adminMode;
											},
										},
										t('admin.manage_options'),
									),
						])
					: facilitated
						? null
						: renderAdminSignIn(question.statementId, question.creatorId),
				showUserAddButton
					? m('.solutions__add-row', [
							m(
								'button.btn.btn--primary.solutions__add-button',
								{
									onclick: () => {
										addAsOrganizer = false;
										showAddSuggestion = true;
									},
								},
								[
									m('span.solutions__add-button-icon', { 'aria-hidden': 'true' }, '+'),
									m('span', t('solutions.add_suggestion')),
								],
							),
						])
					: null,
				options.length === 0
					? m('.solutions__empty', t('solutions.error.no_options'))
					: m('.solutions__crowd-section', [
							// Header only appears when the organizer section is also
							// visible, so a simple question without any organizer
							// suggestions still shows a single unlabeled list.
							getOrganizerSuggestions().length > 0
								? m('h2.solutions__crowd-heading', t('admin.crowd_section'))
								: null,
							m(
								'.solutions__list',
								{
									onbeforeupdate: (_vnode: m.VnodeDOM, oldVnode: m.VnodeDOM) => {
										capturedListRects = captureFlipPositions(oldVnode.dom as HTMLElement);

										return true;
									},
									onupdate: (vnode: m.VnodeDOM) => {
										if (capturedListRects) {
											playFlipAnimation(vnode.dom as HTMLElement, capturedListRects);
											capturedListRects = null;
										}
									},
								},
								options.map((option) =>
									m(SolutionCard, {
										key: option.statementId,
										option,
										questionId: question.statementId,
										adminMode: isAdmin() && adminMode && !facilitated,
										displayOnly: facilitated,
										highlighted: isOptionNewlyArrived(option.statementId),
										onRequestJoinForm: (optionId: string, role: 'activist' | 'organizer') => {
											pendingJoinOptionId = optionId;
											pendingJoinRole = role;
											showJoinForm = true;
										},
										onRequestLimitSwap: (
											optionId: string,
											optionTitle: string,
											role: 'activist' | 'organizer',
											currentJoins: Statement[],
										) => {
											limitPendingOptionId = optionId;
											limitPendingOptionTitle = optionTitle;
											limitPendingRole = role;
											limitCurrentJoins = currentJoins;
											showLimitSwap = true;
										},
										onRequestEdit: (optionId: string) => {
											editingOptionId = optionId;
										},
									}),
								),
							),
						]),
				// Organizer suggestions render AFTER the crowd list — the crowd
				// is the primary content, admin additions come last.
				renderOrganizerSection(question.statementId, adminMode, facilitated, isOptionNewlyArrived),
				m(WizColFooter),
			]),
			showJoinForm && question.statementSettings?.joinForm
				? m(JoinFormModal, {
						joinForm: question.statementSettings.joinForm,
						questionId: question.statementId,
						optionId: pendingJoinOptionId!,
						role: pendingJoinRole,
						onClose: () => {
							showJoinForm = false;
							pendingJoinOptionId = null;
						},
					})
				: null,
			showAddSuggestion
				? m(AddSuggestionModal, {
						asOrganizer: addAsOrganizer,
						onClose: () => {
							showAddSuggestion = false;
						},
					})
				: null,
			showLimitSwap && limitPendingOptionId
				? m(LimitReachedModal, {
						pendingOptionId: limitPendingOptionId,
						pendingOptionTitle: limitPendingOptionTitle,
						questionId: question.statementId,
						role: limitPendingRole,
						currentJoins: limitCurrentJoins,
						maxJoinsPerUser: question.statementSettings?.activationThreshold?.maxJoinsPerUser ?? 0,
						onClose: () => {
							showLimitSwap = false;
							limitPendingOptionId = null;
							limitCurrentJoins = [];
						},
					})
				: null,
			renderEditModal(),
			m(FacilitatorPanel),
		]);
	},
};

/** Discreet "Sign in as admin" affordance for anonymous visitors. The Join
 *  app signs users in anonymously by default, so admins whose Google uid
 *  would match the question need a way to upgrade the session and trigger a
 *  fresh admin check. Hidden once the user has a non-anonymous session to
 *  avoid nagging non-admin Google users. */
function renderAdminSignIn(questionId: string, creatorId: string): m.Children {
	const user = getUserState().user;
	if (!user || !user.isAnonymous) return null;

	return m('.solutions__admin-signin', [
		m(
			'button.btn.btn--small.btn--outline',
			{
				onclick: async () => {
					try {
						await signInWithGoogle();
						await checkAdminStatus(questionId, creatorId);
						m.redraw();
					} catch (err) {
						console.error('[Solutions] Admin sign-in failed:', err);
					}
				},
			},
			t('admin.signin'),
		),
	]);
}

function renderOrganizerSection(
	questionId: string,
	adminModeActive: boolean,
	facilitated: boolean,
	isHighlighted: (id: string) => boolean,
): m.Children {
	const suggestions = getOrganizerSuggestions();
	if (suggestions.length === 0) return null;

	return m('.solutions__organizer-section', [
		m('h2.solutions__organizer-heading', t('admin.suggestions_section')),
		m(
			'.solutions__list',
			suggestions.map((option) =>
				m(SolutionCard, {
					key: option.statementId,
					option,
					questionId,
					isOrganizerSuggestion: true,
					adminMode: isAdmin() && adminModeActive && !facilitated,
					displayOnly: facilitated,
					highlighted: isHighlighted(option.statementId),
					onRequestJoinForm: (optionId: string, role: 'activist' | 'organizer') => {
						pendingJoinOptionId = optionId;
						pendingJoinRole = role;
						showJoinForm = true;
					},
					onRequestLimitSwap: (
						optionId: string,
						optionTitle: string,
						role: 'activist' | 'organizer',
						currentJoins: Statement[],
					) => {
						limitPendingOptionId = optionId;
						limitPendingOptionTitle = optionTitle;
						limitPendingRole = role;
						limitCurrentJoins = currentJoins;
						showLimitSwap = true;
					},
					onRequestEdit: (optionId: string) => {
						editingOptionId = optionId;
					},
				}),
			),
		),
	]);
}

function renderEditModal(): m.Children {
	if (!editingOptionId) return null;
	// Re-resolve from the store every render so the modal reflects the latest
	// snapshot. If the option was removed (e.g. admin deleted it during edit),
	// drop the modal silently rather than crash with a stale reference.
	const option = getOptionById(editingOptionId);
	if (!option) {
		editingOptionId = null;

		return null;
	}

	return m(EditSuggestionModal, {
		option,
		onClose: () => {
			editingOptionId = null;
		},
	});
}

function buildSubtitleText(question: Statement): string {
	const threshold = question.statementSettings?.activationThreshold;
	if (!threshold?.enabled) {
		return t('solutions.subtitle.default');
	}

	const parts: string[] = [];
	if (threshold.minOrganizers) {
		const key =
			threshold.minOrganizers > 1 ? 'threshold.organizers_plural' : 'threshold.organizers';
		parts.push(t(key, { count: threshold.minOrganizers }));
	}
	if (threshold.minActivists) {
		const key = threshold.minActivists > 1 ? 'threshold.activists_plural' : 'threshold.activists';
		parts.push(t(key, { count: threshold.minActivists }));
	}

	if (parts.length === 0) {
		return t('solutions.subtitle.default');
	}

	return t('solutions.subtitle.threshold', { requirements: parts.join(' & ') });
}
