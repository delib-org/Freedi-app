import m from 'mithril';
import '@/styles/teacher.scss';
import { getUserState, signOut } from '@/lib/user';
import { t } from '@/lib/i18n';
import { setFollowLessonLanguage } from '@/lib/store';
import { WizColFooter } from '@/components/WizColFooter';
import { BrandLogo } from '@/components/BrandLogo';
import { subscribeToClassLessons, type ClassLessonEntry } from '@/lib/joinSubscriptions';
import type { Unsubscribe } from '@/lib/firebase';
import { createLesson, LESSON_STEP_KEYS } from '@/lib/lesson';
import { classSetLessonStatus } from '@/lib/classroom/api';
import { normalizeQuestionText } from './planHelpers';
import { filterLessons, statusChipOf } from './homeHelpers';

const MAX_LESSON_TITLE = 200;
/** A name filter appears above this many lessons (IA 13.11). */
const FILTER_FROM = 10;

let lessons: ClassLessonEntry[] = [];
let unsub: Unsubscribe | null = null;
let listReady = false;
let formOpen = false;
let titleInput = '';
let creating = false;
let createError: string | null = null;
let filterText = '';
/** Row actions that failed or are running, by lesson id. */
const reopening = new Set<string>();
const reopenErrors = new Set<string>();

function accountName(): string {
	const user = getUserState().user;

	return user?.displayName || user?.email || '';
}

async function handleSignOut(): Promise<void> {
	try {
		await signOut();
	} catch (err) {
		console.error('[TeacherHome] sign-out failed:', err);
	}
	m.route.set('/');
}

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
		const id = await createLesson(title);
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

async function handleReopen(id: string): Promise<void> {
	if (reopening.has(id)) return;
	reopening.add(id);
	reopenErrors.delete(id);
	m.redraw();
	try {
		await classSetLessonStatus({ mainId: id, action: 'reopen' });
		m.route.set(`/t/${id}`);
	} catch (err) {
		console.error('[TeacherHome] reopen failed:', err);
		reopenErrors.add(id);
	} finally {
		reopening.delete(id);
		m.redraw();
	}
}

function renderForm(emptyState: boolean): m.Vnode {
	return m('form.teacher-home__form', { onsubmit: handleCreate }, [
		emptyState ? m('p.teacher-home__lead', t('teacher.home.empty')) : null,
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
			onkeydown: (e: KeyboardEvent) => {
				if (e.key === 'Escape' && !emptyState) closeForm();
			},
		}),
		m('.teacher-home__form-actions', [
			m(
				'button.btn.btn--primary',
				{ type: 'submit', disabled: creating, 'aria-busy': creating ? 'true' : undefined },
				creating ? t('teacher.new.busy') : t('teacher.new.create'),
			),
			// Nothing to go back to when this is the only thing on the screen.
			emptyState
				? null
				: m(
						'button.btn.btn--tertiary',
						{ type: 'button', disabled: creating, onclick: closeForm },
						t('teacher.new.cancel'),
					),
		]),
		createError ? m('.teacher-home__error', { role: 'alert' }, createError) : null,
	]);
}

function closeForm(): void {
	formOpen = false;
	titleInput = '';
	createError = null;
	queueMicrotask(() => document.querySelector<HTMLElement>('.teacher-home__new')?.focus());
}

function renderRow(w: ClassLessonEntry): m.Vnode {
	const chip = statusChipOf(w.status, w.stepIndex);
	const label = (action: string): string => t('teacher.row.for', { action, name: w.title });
	const ended = w.status === 'ended';
	const busy = reopening.has(w.id);

	return m('li.teacher-home__row', { key: w.id, class: `teacher-home__row--${chip.mark}` }, [
		m('h2.teacher-home__row-title', { dir: 'auto' }, w.title),
		m('p.status-chip', { class: `status-chip--${chip.mark}` }, [
			m('span.status-mark', { class: `status-mark--${chip.mark}`, 'aria-hidden': 'true' }),
			m('span', t(chip.key, { n: w.stepIndex + 1, total: LESSON_STEP_KEYS.length })),
		]),
		m('.teacher-home__row-actions', [
			m(
				m.route.Link,
				{
					class: 'btn btn--secondary btn--small',
					href: `/t/${w.id}/plan`,
					'data-action': 'plan',
					'aria-label': label(t('teacher.row.plan')),
				},
				t('teacher.row.plan'),
			),
			ended
				? m(
						'button.btn.btn--primary.btn--small',
						{
							type: 'button',
							'data-action': 'reopen',
							disabled: busy,
							'aria-busy': busy ? 'true' : undefined,
							'aria-label': label(t('teacher.row.reopen')),
							onclick: () => void handleReopen(w.id),
						},
						busy ? t('console.opening') : t('teacher.row.reopen'),
					)
				: m(
						m.route.Link,
						{
							class: 'btn btn--primary btn--small',
							href: `/t/${w.id}`,
							'data-action': 'open',
							'aria-label': label(t('teacher.row.open')),
						},
						t('teacher.row.open'),
					),
		]),
		reopenErrors.has(w.id)
			? m('.teacher-home__error', { role: 'alert' }, [
					m('span', t('console.failed', { label: t('teacher.row.reopen') })),
					m(
						'button.btn.btn--tertiary.btn--small',
						{ type: 'button', onclick: () => void handleReopen(w.id) },
						t('console.retry'),
					),
				])
			: null,
	]);
}

function renderFilter(shown: number): m.Children {
	return [
		m('input.teacher-home__filter', {
			type: 'search',
			value: filterText,
			placeholder: t('teacher.home.filter'),
			'aria-label': t('teacher.home.filter'),
			oninput: (e: Event) => {
				filterText = (e.target as HTMLInputElement).value;
			},
			onkeydown: (e: KeyboardEvent) => {
				if (e.key === 'Escape') filterText = '';
			},
		}),
		m(
			'.visually-hidden',
			{ role: 'status', 'aria-live': 'polite' },
			t('teacher.home.filter_count', { n: shown }),
		),
	];
}

function renderList(): m.Children {
	if (!listReady) {
		return m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') });
	}
	const filtering = lessons.length > FILTER_FROM;
	const shown = filtering ? filterLessons(lessons, filterText) : lessons;

	return [
		filtering ? renderFilter(shown.length) : null,
		filtering && shown.length === 0
			? m('p.teacher-home__empty', t('teacher.home.filter_none'))
			: null,
		m('ul.teacher-home__list', shown.map(renderRow)),
	];
}

export const TeacherHome: m.Component = {
	oninit() {
		// The teacher's own screens keep the teacher's language, whatever the lesson's is.
		setFollowLessonLanguage(false);
		listReady = false;
		formOpen = false;
		createError = null;
		filterText = '';
		const uid = getUserState().user?.uid;
		if (!uid) return;
		if (unsub) unsub();
		unsub = subscribeToClassLessons(uid, (entries) => {
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
		const emptyState = listReady && lessons.length === 0;
		const name = accountName();

		return m('.teacher-home', [
			m('header.teacher-home__header', [
				m(BrandLogo, { size: 40, className: 'teacher-home__logo' }),
				name ? m('p.teacher-home__account', t('teacher.account', { name })) : null,
				m(
					'button.btn.btn--tertiary.btn--small.teacher-home__signout',
					{ type: 'button', onclick: () => void handleSignOut() },
					t('teacher.signout'),
				),
			]),
			m('main.teacher-home__body', [
				m('h1.teacher-home__title', t('teacher.home.title')),
				emptyState ? m('p.teacher-home__how', t('teacher.home.how')) : null,
				emptyState || formOpen
					? renderForm(emptyState)
					: listReady
						? m(
								'button.btn.btn--primary.teacher-home__new',
								{
									type: 'button',
									onclick: () => {
										formOpen = true;
									},
								},
								t('teacher.new'),
							)
						: null,
				renderList(),
			]),
			m(WizColFooter),
		]);
	},
};
