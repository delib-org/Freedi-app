import m from 'mithril';
import '@/styles/teacher.scss';
import { getUserState } from '@/lib/user';
import { t } from '@/lib/i18n';
import { WizColFooter } from '@/components/WizColFooter';
import { BrandLogo } from '@/components/BrandLogo';
import { subscribeToJoinMain, markOpenedInJoin, type JoinMainEntry } from '@/lib/joinSubscriptions';
import type { Unsubscribe } from '@/lib/firebase';
import { createSimpleQuestion, loadQuestion, getQuestion } from '@/lib/store';
import { ensureClassCode } from '@/lib/lesson';
import { normalizeQuestionText } from './planHelpers';

const MAX_LESSON_TITLE = 200;

let lessons: JoinMainEntry[] = [];
let unsub: Unsubscribe | null = null;
let listReady = false;
let formOpen = false;
let titleInput = '';
let creating = false;
let createError: string | null = null;

async function handleCreate(e: Event): Promise<void> {
	e.preventDefault();
	if (creating) return;
	const title = normalizeQuestionText(titleInput, MAX_LESSON_TITLE);
	if (!title) {
		createError = t('teacher.new.invalid');
		m.redraw();

		return;
	}
	creating = true;
	createError = null;
	m.redraw();
	try {
		const id = await createSimpleQuestion(title);
		if (!id) {
			createError = t('teacher.new.failed');

			return;
		}
		const user = getUserState().user;
		if (user) {
			await loadQuestion(id);
			const stmt = getQuestion();
			if (stmt) {
				await markOpenedInJoin(stmt, user.uid, user.displayName ?? '').catch((err: unknown) => {
					console.error('[TeacherHome] markOpenedInJoin failed:', err);
				});
			}
		}
		// The join code exists from the first minute, so the plan/console show it.
		await ensureClassCode(id).catch((err: unknown) => {
			console.error('[TeacherHome] ensureClassCode failed:', err);
		});
		titleInput = '';
		formOpen = false;
		m.route.set(`/t/${id}/plan`);
	} catch (err) {
		console.error('[TeacherHome] create lesson failed:', err);
		createError = t('teacher.new.failed');
	} finally {
		creating = false;
		m.redraw();
	}
}

function renderForm(): m.Vnode {
	return m('form.teacher-home__form', { onsubmit: handleCreate }, [
		m('label.teacher-home__label', { for: 'teacher-new-title' }, t('teacher.new.title_label')),
		m('input.teacher-home__input', {
			id: 'teacher-new-title',
			type: 'text',
			value: titleInput,
			maxlength: MAX_LESSON_TITLE,
			placeholder: t('teacher.new.placeholder'),
			disabled: creating,
			'aria-invalid': createError ? 'true' : undefined,
			oncreate: (vn: m.VnodeDOM) => (vn.dom as HTMLInputElement).focus(),
			oninput: (e: Event) => {
				titleInput = (e.target as HTMLInputElement).value;
				if (createError) createError = null;
			},
		}),
		m('.teacher-home__form-actions', [
			m(
				'button.btn.btn--primary',
				{ type: 'submit', disabled: creating, 'aria-busy': creating ? 'true' : undefined },
				creating ? t('teacher.new.busy') : t('teacher.new.create'),
			),
			m(
				'button.btn.btn--tertiary',
				{
					type: 'button',
					disabled: creating,
					onclick: () => {
						formOpen = false;
						titleInput = '';
						createError = null;
					},
				},
				t('teacher.new.cancel'),
			),
		]),
		createError ? m('.teacher-home__error', { role: 'alert' }, createError) : null,
	]);
}

function renderRow(w: JoinMainEntry): m.Vnode {
	return m(
		'li.teacher-home__row',
		{ key: w.id, style: `--q-accent: ${w.color || 'var(--terra-500)'}` },
		[
			m('h2.teacher-home__row-title', w.title),
			m('.teacher-home__row-actions', [
				m(
					m.route.Link,
					{
						class: 'btn btn--secondary btn--small',
						href: `/t/${w.id}/plan`,
						'data-action': 'plan',
					},
					t('teacher.row.plan'),
				),
				m(
					m.route.Link,
					{ class: 'btn btn--primary btn--small', href: `/t/${w.id}`, 'data-action': 'open' },
					t('teacher.row.open'),
				),
			]),
		],
	);
}

export const TeacherHome: m.Component = {
	oninit() {
		listReady = false;
		formOpen = false;
		createError = null;
		const uid = getUserState().user?.uid;
		if (!uid) return;
		if (unsub) unsub();
		unsub = subscribeToJoinMain(uid, (entries) => {
			lessons = entries;
			listReady = true;
			m.redraw();
		});
	},

	onremove() {
		if (unsub) {
			unsub();
			unsub = null;
		}
	},

	view() {
		return m('.teacher-home', [
			m('header.teacher-home__header', [
				m(BrandLogo, { size: 48, className: 'teacher-home__logo' }),
			]),
			m('main.teacher-home__body', [
				m('h1.teacher-home__title', t('teacher.home.title')),
				formOpen
					? renderForm()
					: m(
							'button.btn.btn--primary.teacher-home__new',
							{
								type: 'button',
								onclick: () => {
									formOpen = true;
								},
							},
							t('teacher.new'),
						),
				!listReady
					? m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') })
					: lessons.length === 0
						? m('p.teacher-home__empty', t('teacher.home.empty'))
						: m('ul.teacher-home__list', lessons.map(renderRow)),
			]),
			m(WizColFooter),
		]);
	},
};
