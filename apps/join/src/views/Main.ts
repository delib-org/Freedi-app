import m from 'mithril';
import { getUserState, signOut } from '@/lib/user';
import { t, isRTL } from '@/lib/i18n';
import { WizColFooter } from '@/components/WizColFooter';
import { parseWorkspaceId } from '@/lib/myWorkspaces';
import {
	subscribeToJoinMain,
	unmarkFromJoinMain,
	setJoinMainOrder,
	markOpenedInJoin,
	type JoinMainEntry,
} from '@/lib/joinSubscriptions';
import type { Unsubscribe } from '@/lib/firebase';
import { createSimpleQuestion, loadQuestion, getQuestion } from '@/lib/store';
import { createDragReorder } from '@/lib/dragReorder';

let workspaces: JoinMainEntry[] = [];
let workspacesUnsub: Unsubscribe | null = null;

// Drag-to-reorder. Commits to Firestore — `joinOrder` is a numeric index
// per subscription, so manual ordering survives across devices.
const workspaceReorder = createDragReorder({
	onCommit: (orderedIds) => {
		const uid = getUserState().user?.uid;
		if (!uid) return;
		void setJoinMainOrder(orderedIds, uid).catch((err) => {
			console.error('[Main] reorder commit failed:', err);
		});
	},
});

let signingOut = false;
let openInput = '';
let openError: string | null = null;
let createInput = '';
let creating = false;
let createError: string | null = null;

async function handleSignOut(): Promise<void> {
	if (signingOut) return;
	signingOut = true;
	m.redraw();
	try {
		await signOut();
		m.route.set('/login');
	} catch (err) {
		console.error('[Main] Sign-out failed:', err);
	} finally {
		signingOut = false;
		m.redraw();
	}
}

function handleOpenSubmit(e: Event): void {
	e.preventDefault();
	const id = parseWorkspaceId(openInput);
	if (!id) {
		openError = t('main.open_question_invalid');
		m.redraw();

		return;
	}
	openError = null;
	openInput = '';
	m.route.set(`/m/${id}`);
}

async function handleCreateSubmit(e: Event): Promise<void> {
	e.preventDefault();
	if (creating) return;
	const title = createInput.trim();
	if (!title) {
		createError = t('main.create_question_invalid');
		m.redraw();

		return;
	}
	creating = true;
	createError = null;
	m.redraw();
	try {
		const id = await createSimpleQuestion(title);
		if (!id) {
			createError = t('main.create_question_failed');

			return;
		}
		// Mark this fresh statement as "opened in join" so the live Main
		// listener picks it up immediately. We re-load it here so we have
		// the persisted Statement (with topParentId, color, etc.) — the
		// helper needs the full doc to seed the subscription.
		const user = getUserState().user;
		if (user) {
			await loadQuestion(id);
			const stmt = getQuestion();
			if (stmt) {
				await markOpenedInJoin(stmt, user.uid, user.displayName ?? '').catch((err) => {
					console.error('[Main] markOpenedInJoin failed:', err);
				});
			}
		}
		createInput = '';
		m.route.set(`/m/${id}`);
	} catch (err) {
		console.error('[Main] Create question failed:', err);
		createError = t('main.create_question_failed');
	} finally {
		creating = false;
		m.redraw();
	}
}

function handleRemove(id: string): void {
	const uid = getUserState().user?.uid;
	if (!uid) return;
	// Optimistic: drop from the local list before the snapshot round-trips,
	// so the card vanishes on click. Snapshot will reconcile.
	workspaces = workspaces.filter((w) => w.id !== id);
	m.redraw();
	void unmarkFromJoinMain(id, uid).catch((err) => {
		console.error('[Main] unmarkFromJoinMain failed:', err);
	});
}

function displayName(): string {
	const user = getUserState().user;
	if (!user) return t('common.anonymous');
	if (user.isAnonymous) return t('common.anonymous');

	return user.displayName || user.email || t('common.anonymous');
}

function renderWorkspaceCard(w: JoinMainEntry, currentIds: string[]): m.Vnode {
	const accent = w.color || 'var(--terra-500)';
	const dragging = workspaceReorder.isDragging(w.id);
	const isDropTarget = workspaceReorder.isDropTarget(w.id);

	const classes = [
		'main-page__workspace',
		dragging ? 'main-page__workspace--dragging' : null,
		isDropTarget ? 'main-page__workspace--drop-target' : null,
	].filter(Boolean);

	return m(
		'div',
		{
			key: w.id,
			class: classes.join(' '),
			style: `--q-accent: ${accent}`,
			role: 'group',
			'aria-label': w.title,
			...workspaceReorder.cardAttrs(w.id, currentIds),
		},
		[
			m(
				'span.main-page__workspace-handle',
				{
					'aria-hidden': 'true',
					title: t('mainHub.reorder.handle'),
					// Keep clicks here from bubbling into the open button when the
					// handle visually overlaps the card body.
					onclick: (e: MouseEvent) => {
						e.stopPropagation();
					},
				},
				'⋮⋮',
			),
			m(
				'button.main-page__workspace-open',
				{
					type: 'button',
					onclick: () => {
						// Always route through the workspace hub. A statement created
						// from /q is still a top-level question and the hub renders
						// it correctly when there are no sub-questions.
						m.route.set(`/m/${w.id}`);
					},
				},
				[m('span.main-page__workspace-title', w.title), m('span.main-page__workspace-id', w.id)],
			),
			m(
				'button.main-page__workspace-remove',
				{
					type: 'button',
					'aria-label': t('main.workspace_remove_aria', { name: w.title }),
					onclick: (e: Event) => {
						e.stopPropagation();
						handleRemove(w.id);
					},
				},
				'×',
			),
		],
	);
}

export const Main: m.Component = {
	oninit() {
		// Subscribe to the user's join-Main entries on mount. Re-mount on auth
		// change is handled by the route layer; we rebuild the listener if the
		// uid we see at oninit differs from any existing listener.
		const uid = getUserState().user?.uid;
		if (!uid) return;
		if (workspacesUnsub) workspacesUnsub();
		workspacesUnsub = subscribeToJoinMain(uid, (entries) => {
			workspaces = entries;
			m.redraw();
		});
	},

	onremove() {
		if (workspacesUnsub) {
			workspacesUnsub();
			workspacesUnsub = null;
		}
	},

	view() {
		const user = getUserState().user;
		const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';
		const isGuest = !user || user.isAnonymous;
		// Apply the optimistic post-drop ordering while the Firestore write
		// settles, so the card stays where the user dropped it until the
		// snapshot reflects the new joinOrder values.
		const orderedWorkspaces = workspaceReorder.applyOrder(workspaces, (w) => w.id);
		const workspaceIds = orderedWorkspaces.map((w) => w.id);

		return m('.main-page', [
			m('header.main-page__header', [
				m('img.main-page__logo', {
					src: logoSrc,
					alt: 'WizCol',
					width: 48,
					height: 48,
					loading: 'eager',
					decoding: 'async',
				}),
				m(
					'button.main-page__signout',
					{
						type: 'button',
						disabled: signingOut,
						'aria-busy': signingOut ? 'true' : undefined,
						onclick: handleSignOut,
					},
					t('main.signout'),
				),
			]),
			m('main.main-page__body', [
				m('h1.main-page__title', t('main.welcome', { name: displayName() })),
				m('p.main-page__lede', isGuest ? t('main.lede_guest') : t('main.lede')),
				m('section.main-page__panel', [
					m('h2.main-page__panel-title', t('main.create_question_title')),
					m('p.main-page__panel-text', t('main.create_question_help')),
					m('form.main-page__open-form', { onsubmit: handleCreateSubmit }, [
						m('input.main-page__open-input', {
							type: 'text',
							name: 'questionTitle',
							value: createInput,
							placeholder: t('main.create_question_placeholder'),
							'aria-label': t('main.create_question_placeholder'),
							'aria-invalid': createError ? 'true' : undefined,
							disabled: creating,
							maxlength: 200,
							oninput: (e: Event) => {
								createInput = (e.target as HTMLInputElement).value;
								if (createError) createError = null;
							},
						}),
						m(
							'button.main-page__open-submit',
							{
								type: 'submit',
								disabled: creating,
								'aria-busy': creating ? 'true' : undefined,
							},
							creating ? t('main.create_question_busy') : t('main.create_question_submit'),
						),
					]),
					createError ? m('.main-page__open-error', { role: 'alert' }, createError) : null,
				]),
				m('section.main-page__panel', [
					m('h2.main-page__panel-title', t('main.open_question_title')),
					m('p.main-page__panel-text', t('main.open_question_help')),
					m('form.main-page__open-form', { onsubmit: handleOpenSubmit }, [
						m('input.main-page__open-input', {
							type: 'text',
							name: 'workspaceId',
							value: openInput,
							placeholder: t('main.open_question_placeholder'),
							'aria-label': t('main.open_question_placeholder'),
							'aria-invalid': openError ? 'true' : undefined,
							oninput: (e: Event) => {
								openInput = (e.target as HTMLInputElement).value;
								if (openError) openError = null;
							},
						}),
						m('button.main-page__open-submit', { type: 'submit' }, t('main.open_question_submit')),
					]),
					openError ? m('.main-page__open-error', { role: 'alert' }, openError) : null,
				]),
				m('section.main-page__panel', [
					m('h2.main-page__panel-title', t('main.my_questions_title')),
					orderedWorkspaces.length === 0
						? m('p.main-page__panel-text', t('main.my_questions_empty'))
						: [
								m(
									'ul.main-page__workspace-list',
									workspaceReorder.listAttrs(),
									orderedWorkspaces.map((w) =>
										m(
											'li.main-page__workspace-item',
											{ key: w.id },
											renderWorkspaceCard(w, workspaceIds),
										),
									),
								),
								// End-drop zone — only rendered while a drag is in flight,
								// so it doesn't take space in the resting layout. Sibling
								// of the keyed list (Mithril rejects mixing keyed and
								// unkeyed children inside the same fragment).
								workspaceReorder.isActive()
									? m('.main-page__workspace-drop-end', {
											'aria-hidden': 'true',
											...workspaceReorder.endDropAttrs(workspaceIds),
										})
									: null,
							],
				]),
			]),
			m(WizColFooter),
		]);
	},
};
