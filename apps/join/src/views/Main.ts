import m from 'mithril';
import { getUserState, signOut } from '@/lib/user';
import { t, isRTL } from '@/lib/i18n';
import { WizColFooter } from '@/components/WizColFooter';
import {
	getMyWorkspaces,
	recordMyWorkspace,
	removeMyWorkspace,
	parseWorkspaceId,
	workspaceRoute,
	type MyWorkspace,
} from '@/lib/myWorkspaces';
import { createSimpleQuestion } from '@/lib/store';

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
		// Save locally so it shows up in "My questions" immediately, even
		// before the Cloud Function fans out the admin subscription doc.
		recordMyWorkspace({ id, title, kind: 'question' });
		createInput = '';
		m.route.set(`/q/${id}`);
	} catch (err) {
		console.error('[Main] Create question failed:', err);
		createError = t('main.create_question_failed');
	} finally {
		creating = false;
		m.redraw();
	}
}

function handleRemove(id: string): void {
	removeMyWorkspace(id);
	m.redraw();
}

function displayName(): string {
	const user = getUserState().user;
	if (!user) return t('common.anonymous');
	if (user.isAnonymous) return t('common.anonymous');

	return user.displayName || user.email || t('common.anonymous');
}

function renderWorkspaceCard(w: MyWorkspace): m.Vnode {
	const accent = w.color || 'var(--terra-500)';

	return m(
		'.main-page__workspace',
		{
			key: w.id,
			style: `--q-accent: ${accent}`,
			role: 'group',
			'aria-label': w.title,
		},
		[
			m(
				'button.main-page__workspace-open',
				{
					type: 'button',
					onclick: () => {
						m.route.set(workspaceRoute(w));
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
	view() {
		const user = getUserState().user;
		const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';
		const isGuest = !user || user.isAnonymous;
		const workspaces = getMyWorkspaces();

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
					workspaces.length === 0
						? m('p.main-page__panel-text', t('main.my_questions_empty'))
						: m(
								'ul.main-page__workspace-list',
								workspaces.map((w) =>
									m('li.main-page__workspace-item', { key: w.id }, renderWorkspaceCard(w)),
								),
							),
				]),
			]),
			m(WizColFooter),
		]);
	},
};
