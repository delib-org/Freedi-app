import m from 'mithril';
import { getRandomUID } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { startLesson } from '@/lib/lesson';
import { getUserState } from '@/lib/user';
import { loadTeacherClasses, type TeacherClass } from '@/lib/teacherClasses';
import { startFailureOf, type StartFailure } from './startFailure';

/**
 * "+ שיעור עם כיתה" (docs/ia/join-class-lesson-plan.md 5 and 6.4): an inline choice
 * "איזו כיתה?" among the teacher's active Studio classes plus "בלי כיתה". With no
 * classes it says so and offers one "יצירה" (the lesson is kept under the teacher).
 * Then the teacher lands on the console at Waiting, with the code.
 *
 * One form is open at a time, keyed by the game it plays. `newMainId` is made when
 * the form opens and kept until it succeeds or closes, so a retry after a failure
 * returns the lesson the server already made instead of a second one.
 */

type ClassesLoad = 'loading' | 'ready' | 'error';

let openGameId: string | null = null;
let classes: TeacherClass[] = [];
let classesLoad: ClassesLoad = 'loading';
/** undefined = nothing picked yet; null = "בלי כיתה"; a string = that class. */
let picked: string | null | undefined;
let newMainId = '';
let busy = false;
let failure: StartFailure | null = null;

export function isClassFormOpen(gameId: string): boolean {
	return openGameId === gameId;
}

async function loadClasses(): Promise<void> {
	const uid = getUserState().user?.uid;
	classesLoad = 'loading';
	if (!uid) {
		classesLoad = 'error';

		return;
	}
	try {
		const list = await loadTeacherClasses(uid);
		classes = list;
		classesLoad = 'ready';
	} catch (err) {
		console.error('[ClassForm] loading the classes failed:', err);
		classesLoad = 'error';
	} finally {
		m.redraw();
	}
}

export function openClassForm(gameId: string): void {
	if (openGameId === gameId) return;
	openGameId = gameId;
	picked = undefined;
	newMainId = getRandomUID();
	busy = false;
	failure = null;
	classes = [];
	void loadClasses();
	m.redraw();
}

export function closeClassForm(): void {
	openGameId = null;
	busy = false;
	failure = null;
}

async function submit(planId: string, gameId: string): Promise<void> {
	if (busy) return;
	const noClasses = classesLoad === 'ready' && classes.length === 0;
	const classId = noClasses ? null : picked;
	if (classId === undefined) return;
	busy = true;
	failure = null;
	m.redraw();
	try {
		const id = await startLesson({ planId, gameId, classId, newMainId });
		closeClassForm();
		m.route.set(`/t/${id}`);
	} catch (err) {
		console.error('[ClassForm] starting the lesson failed:', err);
		failure = startFailureOf(err);
	} finally {
		busy = false;
		m.redraw();
	}
}

function choice(id: string | null, label: string, value: string): m.Vnode {
	return m('label.class-form__choice', [
		m('input', {
			type: 'radio',
			name: 'class-choice',
			value,
			checked: picked === id,
			disabled: busy,
			'data-class': value,
			onchange: () => {
				picked = id;
			},
		}),
		m('bdi', { dir: 'auto' }, label),
	]);
}

function failureText(kind: StartFailure): string {
	if (kind === 'not_approved') return t('teacher.lesson.not_approved');

	return kind === 'not_yours' ? t('teacher.copy.not_yours') : t('teacher.copy.failed');
}

export interface ClassFormAttrs {
	planId: string;
	gameId: string;
}

export const ClassForm: m.Component<ClassFormAttrs> = {
	view({ attrs }) {
		const { planId, gameId } = attrs;
		if (openGameId !== gameId) return null;
		const noClasses = classesLoad === 'ready' && classes.length === 0;
		const ready = classesLoad === 'ready';
		const canSubmit = !busy && ready && (noClasses || picked !== undefined);

		return m(
			'form.class-form',
			{
				'aria-busy': busy ? 'true' : undefined,
				// opened from a button far away (the game screen's fixed bar): bring it into view
				oncreate: (vn: m.VnodeDOM) => {
					const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
					(vn.dom as HTMLElement).scrollIntoView({
						block: 'center',
						behavior: reduced ? 'auto' : 'smooth',
					});
				},
				onsubmit: (e: Event) => {
					e.preventDefault();
					void submit(planId, gameId);
				},
			},
			[
				classesLoad === 'loading' ? m('p.class-form__lead', t('plan.loading')) : null,
				classesLoad === 'error'
					? m('.class-form__error', { role: 'alert' }, [
							m('span', t('teacher.copy.failed')),
							m(
								'button.btn.btn--tertiary.btn--small',
								{ type: 'button', onclick: () => void loadClasses() },
								t('plan.error.retry'),
							),
						])
					: null,
				ready && noClasses ? m('p.class-form__lead', t('teacher.lesson.no_classes')) : null,
				ready && !noClasses
					? m('fieldset.class-form__choices', [
							m('legend.class-form__lead', t('teacher.lesson.class_label')),
							...classes.map((c) => choice(c.classId, c.name, c.classId)),
							choice(null, t('teacher.lesson.class_none'), '__none'),
						])
					: null,
				m('.class-form__actions', [
					m(
						'button.btn.btn--primary',
						{
							type: 'submit',
							'data-action': 'start-lesson',
							disabled: !canSubmit,
							'aria-busy': busy ? 'true' : undefined,
						},
						busy ? t('teacher.lesson.busy') : t('teacher.new.create'),
					),
					m(
						'button.btn.btn--tertiary',
						{
							type: 'button',
							disabled: busy,
							onclick: () => {
								closeClassForm();
							},
						},
						t('teacher.new.cancel'),
					),
				]),
				failure ? m('.class-form__error', { role: 'alert' }, failureText(failure)) : null,
				busy ? m('.visually-hidden', { role: 'status' }, t('teacher.lesson.busy')) : null,
			],
		);
	},
};
