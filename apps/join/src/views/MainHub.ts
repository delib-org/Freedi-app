import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { ensureUser, signInWithGoogle, getUserState } from '@/lib/user';
import {
	loadMainStatement,
	getMainStatement,
	getSubQuestions,
	subscribeMainStatement,
	subscribeSubQuestions,
	createSubQuestion,
	setSubQuestionsOrder,
	setSubQuestionHidden,
} from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { recordMyWorkspace } from '@/lib/myWorkspaces';
import { t, isRTL } from '@/lib/i18n';
import { WizColFooter } from '@/components/WizColFooter';
import { FacilitatorPanel } from '@/components/FacilitatorPanel';
import { BackButton } from '@/components/BackButton';
import { SplashLoader } from '@/views/Splash';
import type { Unsubscribe } from '@/lib/firebase';

function getStatementBody(s: Statement): string | null {
	// `description` is the cloud-function-cached preview built from child
	// paragraph sub-statements (`statementType === paragraph`), capped at
	// ~200 chars. Using it here is intentional — it saves an extra Firestore
	// query on the hub. `brief` is the admin-authored tagline fallback.
	// The legacy embedded `paragraphs[]` array is no longer the source of truth.
	if (s.description) return s.description;
	if (s.brief) return s.brief;

	return null;
}

let loading = true;
let error: string | null = null;
let mainUnsub: Unsubscribe | null = null;
let subUnsub: Unsubscribe | null = null;

// --- Admin-only sub-question creation form -----------------------------------
let createInput = '';
let creating = false;
let createError: string | null = null;

// --- Admin-only drag-and-drop reorder state ----------------------------------
// `draggingId` is the statementId of the card currently being dragged. It's
// cleared on dragend/drop. `dropTargetId` is the id whose top edge is the
// current drop indicator; when it equals `__end__`, we're inserting after the
// last card. Both feed visual hints in the rendered list.
let draggingId: string | null = null;
let dropTargetId: string | null = null;
// Pending optimistic order. While the admin is mid-drag we don't write to
// Firestore on every reorder; we only persist on drop. The local order is
// shown by remembering the move-to position in `pendingOrder`. Cleared after
// the write resolves so the live snapshot takes over.
let pendingOrder: string[] | null = null;

function clearDragState(): void {
	draggingId = null;
	dropTargetId = null;
}

export const MainHub: m.Component = {
	async oninit() {
		error = null;
		createInput = '';
		creating = false;
		createError = null;
		clearDragState();
		pendingOrder = null;

		const mainId = m.route.param('mid');
		if (!mainId) {
			error = t('solutions.error.no_id');
			loading = false;
			m.redraw();

			return;
		}

		// Returning from `/m/:mid/q/:qid` to `/m/:mid` — the store still holds
		// `mainStatement` and `subQuestions[]` from the first hub visit, since
		// Solutions only writes to `question`/`allOptions`. When the cached
		// `mainStatement` matches the requested mainId, render immediately and
		// re-attach subscriptions in the background so the view stays live.
		// Cold opens (deep link, refresh) take the original async path.
		const cachedMain = getMainStatement();
		const primed = cachedMain?.statementId === mainId;
		loading = !primed;
		if (primed) m.redraw();

		try {
			await ensureUser();
			if (!primed) {
				await loadMainStatement(mainId);
			}
			// Resolve admin status against the main statement so the facilitator
			// panel handle is visible to admins even on the hub (where no specific
			// question is in scope yet). Per-question status is re-resolved on
			// navigation into Solutions. On a primed return visit, `isAdmin()`
			// is already cached from the first hub visit — calling
			// `checkAdminStatus` again is a cheap re-confirm that doesn't block
			// the first paint.
			const main = getMainStatement();
			if (main) {
				await checkAdminStatus(mainId, main.creatorId);
				// Once admin is confirmed, remember this workspace on this device so
				// it shows up on the Main page list. Non-admin visitors don't get
				// their visit persisted — the list is "workspaces I run", not
				// "workspaces I've seen".
				if (isAdmin()) {
					recordMyWorkspace({
						id: main.statementId,
						title: main.statement,
						color: main.color,
					});
				}
			}
			mainUnsub = subscribeMainStatement(mainId);
			subUnsub = subscribeSubQuestions(mainId);
		} catch (err) {
			console.error('[MainHub] Failed to load:', err);
			error = t('solutions.error.failed');
		} finally {
			loading = false;
			m.redraw();
		}
	},

	onremove() {
		if (mainUnsub) {
			mainUnsub();
			mainUnsub = null;
		}
		if (subUnsub) {
			subUnsub();
			subUnsub = null;
		}
	},

	view() {
		if (loading) {
			return m(SplashLoader);
		}

		if (error) {
			return m('.main-hub', m('.main-hub__empty', error));
		}

		const main = getMainStatement();
		if (!main) {
			return m('.main-hub', m('.main-hub__empty', t('solutions.error.not_found')));
		}

		// Use `pendingOrder` (mid-drag optimistic ordering) when present; it
		// keeps the list shown in the post-drop position even before Firestore
		// confirms the writes.
		const subsRaw = getSubQuestions();
		const subs = pendingOrder ? reorderByIds(subsRaw, pendingOrder) : subsRaw;
		const accentColor = main.color || 'var(--terra-500)';
		const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';
		const admin = isAdmin();
		const mainId = main.statementId;

		return m('.main-hub', { style: `--q-accent: ${accentColor}` }, [
			// Admin-only return path to /. The BackButton self-gates on
			// `isAdmin()`, so participants visiting via a share link never see it.
			m(BackButton, { to: '/' }),
			m('.main-hub__brand', [
				m('img.main-hub__logo', {
					src: logoSrc,
					alt: 'WizCol',
					width: 64,
					height: 64,
					loading: 'eager',
					decoding: 'async',
				}),
				renderAdminSignIn(main.statementId, main.creatorId),
			]),
			m('h1.main-hub__title', main.statement),
			(() => {
				const body = getStatementBody(main);

				return body ? m('.main-hub__description', body) : null;
			})(),
			m('.main-hub__scroll', [
				m('h2.main-hub__questions-heading', t('mainHub.questionsHeading')),
				admin ? renderCreateSubQuestionForm(mainId) : null,
				subs.length === 0
					? m('.main-hub__empty', t('mainHub.empty'))
					: [
							m(
								'.main-hub__question-list',
								{
									// When dragging, allow drop on the list-end zone too —
									// dragging past the last card lands the dragged item at
									// the bottom of the list.
									ondragover: admin
										? (e: DragEvent) => {
												if (!draggingId) return;
												e.preventDefault();
											}
										: undefined,
								},
								// Each card is rendered with a key (q.statementId). Mithril
								// requires all children of a fragment to either be keyed or
								// unkeyed — so the drop-end zone is rendered as a sibling
								// outside this list, never mixed in.
								subs.map((q: Statement) => renderQuestionCard(q, mainId, admin, subs)),
							),
							admin && draggingId
								? m('.main-hub__question-drop-end', {
										'aria-hidden': 'true',
										ondragover: (e: DragEvent) => {
											e.preventDefault();
											if (dropTargetId !== '__end__') {
												dropTargetId = '__end__';
												m.redraw();
											}
										},
										ondrop: (e: DragEvent) => {
											e.preventDefault();
											void handleDrop('__end__', subs);
										},
									})
								: null,
						],
				m(WizColFooter),
			]),
			m(FacilitatorPanel),
		]);
	},
};

function renderCreateSubQuestionForm(mainId: string): m.Vnode {
	return m(
		'form.main-hub__create-question',
		{ onsubmit: (e: Event) => handleCreateSubmit(e, mainId) },
		[
			m(
				'label.main-hub__create-question-label',
				{ for: 'main-hub-create-input' },
				t('mainHub.create.label'),
			),
			m('.main-hub__create-question-row', [
				m('input.main-hub__create-question-input', {
					id: 'main-hub-create-input',
					type: 'text',
					value: createInput,
					placeholder: t('mainHub.create.placeholder'),
					disabled: creating,
					maxlength: 200,
					oninput: (e: Event) => {
						createInput = (e.target as HTMLInputElement).value;
						if (createError) createError = null;
					},
				}),
				m(
					'button.btn.btn--primary.btn--small.main-hub__create-question-submit',
					{
						type: 'submit',
						disabled: creating || createInput.trim().length === 0,
						'aria-busy': creating ? 'true' : undefined,
					},
					creating ? t('mainHub.create.busy') : t('mainHub.create.submit'),
				),
			]),
			createError ? m('.main-hub__create-question-error', { role: 'alert' }, createError) : null,
		],
	);
}

async function handleCreateSubmit(e: Event, mainId: string): Promise<void> {
	e.preventDefault();
	if (creating) return;
	const title = createInput.trim();
	if (!title) {
		createError = t('mainHub.create.invalid');
		m.redraw();

		return;
	}
	creating = true;
	createError = null;
	m.redraw();
	try {
		const id = await createSubQuestion(mainId, title);
		if (!id) {
			createError = t('mainHub.create.failed');

			return;
		}
		createInput = '';
	} catch (err) {
		console.error('[MainHub] Create sub-question failed:', err);
		createError = t('mainHub.create.failed');
	} finally {
		creating = false;
		m.redraw();
	}
}

function renderQuestionCard(
	q: Statement,
	mainId: string,
	admin: boolean,
	subs: Statement[],
): m.Vnode {
	const isHidden = q.hide === true;
	const dragging = admin && draggingId === q.statementId;
	const isDropTarget = admin && dropTargetId === q.statementId && draggingId !== q.statementId;

	const classes = [
		'main-hub__question-card',
		admin ? 'main-hub__question-card--admin' : null,
		admin ? 'main-hub__question-card--interactive' : null,
		isHidden ? 'main-hub__question-card--hidden' : null,
		dragging ? 'main-hub__question-card--dragging' : null,
		isDropTarget ? 'main-hub__question-card--drop-target' : null,
	].filter(Boolean);

	return m(
		'div',
		{
			key: q.statementId,
			class: classes.join(' '),
			role: admin ? 'button' : undefined,
			tabindex: admin ? '0' : undefined,
			'aria-disabled': admin ? undefined : 'true',
			draggable: admin,
			ondragstart: admin
				? (e: DragEvent) => {
						draggingId = q.statementId;
						dropTargetId = null;
						if (e.dataTransfer) {
							e.dataTransfer.effectAllowed = 'move';
							// Some browsers require text data to allow drop.
							e.dataTransfer.setData('text/plain', q.statementId);
						}
						m.redraw();
					}
				: undefined,
			ondragover: admin
				? (e: DragEvent) => {
						if (!draggingId || draggingId === q.statementId) return;
						e.preventDefault();
						if (dropTargetId !== q.statementId) {
							dropTargetId = q.statementId;
							m.redraw();
						}
					}
				: undefined,
			ondragleave: admin
				? () => {
						if (dropTargetId === q.statementId) {
							dropTargetId = null;
							m.redraw();
						}
					}
				: undefined,
			ondrop: admin
				? (e: DragEvent) => {
						if (!draggingId || draggingId === q.statementId) {
							clearDragState();
							m.redraw();

							return;
						}
						e.preventDefault();
						void handleDrop(q.statementId, subs);
					}
				: undefined,
			ondragend: admin
				? () => {
						clearDragState();
						m.redraw();
					}
				: undefined,
			onclick: admin
				? (e: MouseEvent) => {
						// Don't navigate when the click came from a control inside
						// the card (drag handle, hide button) — those handlers stop
						// propagation, but be defensive in case a child forgets.
						const target = e.target as HTMLElement;
						if (target.closest('.main-hub__question-card-control')) return;
						m.route.set(`/m/${mainId}/q/${q.statementId}`);
					}
				: undefined,
			onkeydown: admin
				? (e: KeyboardEvent) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							m.route.set(`/m/${mainId}/q/${q.statementId}`);
						}
					}
				: undefined,
		},
		[
			admin
				? m(
						'span.main-hub__question-card-handle.main-hub__question-card-control',
						{
							'aria-hidden': 'true',
							title: t('mainHub.reorder.handle'),
							// Stop click bubbling so the card's onclick doesn't
							// navigate when the user clicks the handle area.
							onclick: (e: MouseEvent) => {
								e.stopPropagation();
							},
						},
						'⋮⋮',
					)
				: null,
			m('.main-hub__question-card-body', [
				m('.main-hub__question-title', q.statement),
				(() => {
					const body = getStatementBody(q);

					return body ? m('.main-hub__question-description', body) : null;
				})(),
				isHidden ? m('span.main-hub__question-card-hidden-tag', t('mainHub.hidden.tag')) : null,
			]),
			admin
				? m(
						'button.main-hub__question-card-hide.main-hub__question-card-control',
						{
							type: 'button',
							'aria-label': isHidden
								? t('mainHub.hidden.unhideAria', { name: q.statement })
								: t('mainHub.hidden.hideAria', { name: q.statement }),
							title: isHidden ? t('mainHub.hidden.unhide') : t('mainHub.hidden.hide'),
							onclick: (e: MouseEvent) => {
								e.stopPropagation();
								void setSubQuestionHidden(q.statementId, !isHidden);
							},
						},
						isHidden ? '👁️' : '🙈',
					)
				: null,
		],
	);
}

/** Reorder `subs` so `draggingId` lands at the position currently occupied by
 *  `targetId` (or at the end when targetId === '__end__'). Pure function — the
 *  result is what we render mid-drag and what we persist on drop. */
function reorderForDrop(subs: Statement[], targetId: string): Statement[] | null {
	if (!draggingId) return null;
	const dragged = subs.find((s) => s.statementId === draggingId);
	if (!dragged) return null;
	const without = subs.filter((s) => s.statementId !== draggingId);
	if (targetId === '__end__') {
		return [...without, dragged];
	}
	const targetIdx = without.findIndex((s) => s.statementId === targetId);
	if (targetIdx === -1) return null;

	return [...without.slice(0, targetIdx), dragged, ...without.slice(targetIdx)];
}

function reorderByIds(subs: Statement[], orderedIds: string[]): Statement[] {
	const byId = new Map(subs.map((s) => [s.statementId, s]));
	const result: Statement[] = [];
	for (const id of orderedIds) {
		const s = byId.get(id);
		if (s) {
			result.push(s);
			byId.delete(id);
		}
	}
	// Append anything that arrived after the optimistic snapshot was captured.
	for (const s of byId.values()) result.push(s);

	return result;
}

async function handleDrop(targetId: string, subs: Statement[]): Promise<void> {
	const reordered = reorderForDrop(subs, targetId);
	clearDragState();
	if (!reordered) {
		m.redraw();

		return;
	}
	pendingOrder = reordered.map((s) => s.statementId);
	m.redraw();
	try {
		await setSubQuestionsOrder(pendingOrder);
	} catch (err) {
		console.error('[MainHub] Reorder failed:', err);
	} finally {
		// Clear the optimistic override; the live subscription has the truth.
		pendingOrder = null;
		m.redraw();
	}
}

/** Discreet "Sign in as admin" link in the top-inline-end corner of the
 *  hub brand row. Mirrors `Solutions.renderAdminSignIn` but presented as a
 *  text link rather than a button — the hub is a participant-first surface
 *  and shouldn't grow an admin-shaped CTA. Hidden once the user has a
 *  non-anonymous session, at which point either the FacilitatorPanel handle
 *  takes over (admin) or nothing replaces the link (non-admin Google user). */
function renderAdminSignIn(mainId: string, creatorId: string): m.Children {
	const user = getUserState().user;
	if (!user || !user.isAnonymous) return null;

	return m(
		'button.main-hub__admin-signin',
		{
			type: 'button',
			onclick: async () => {
				try {
					await signInWithGoogle();
					await checkAdminStatus(mainId, creatorId);
					// Belated admin confirmation — record the workspace now so it
					// appears on the Main page after this hub recognises us.
					if (isAdmin()) {
						const main = getMainStatement();
						if (main) {
							recordMyWorkspace({
								id: main.statementId,
								title: main.statement,
								color: main.color,
							});
						}
					}
					m.redraw();
				} catch (err) {
					console.error('[MainHub] Admin sign-in failed:', err);
				}
			},
		},
		t('admin.signin'),
	);
}
