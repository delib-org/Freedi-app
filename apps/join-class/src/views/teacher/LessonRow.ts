import m from 'mithril';
import { t, getLang } from '@/lib/i18n';
import { classSetLessonStatus } from '@/lib/classroom/api';
import type { ClassLessonEntry } from '@/lib/joinSubscriptions';
import { statusChipOf } from './homeHelpers';
import { captureException } from '@/lib/sentry';

/**
 * One lesson (a game played with one class) as a row: its status chip and the one
 * action that fits ("לשיעור", or "פתיחה מחדש" when it ended). Used under a game on
 * the plan screen and in "פתוחים עכשיו" on the home.
 */

const SENTINEL = '\u0001';
const reopening = new Set<string>();
const reopenErrors = new Set<string>();

/** Day and month in the teacher's language ("28.10", "10/28"). */
export function shortDate(ms: number): string {
	return new Date(ms).toLocaleDateString(getLang(), { day: 'numeric', month: 'numeric' });
}

/** "ט׳2", or "בלי כיתה" for a lesson held with no class (and for old lessons). */
export function classLabelOf(entry: ClassLessonEntry): string {
	return entry.link.className.trim() || t('teacher.lesson.class_none');
}

/** "{{class}} · {{date}}" with the class name isolated, so an English class keeps its place in RTL. */
export function renderLessonName(entry: ClassLessonEntry): m.Children {
	const [before, after = ''] = t('teacher.lesson.row', {
		class: SENTINEL,
		date: shortDate(entry.createdAt),
	}).split(SENTINEL);

	return [before, m('bdi', { dir: 'auto' }, classLabelOf(entry)), after];
}

export function renderChip(entry: ClassLessonEntry): m.Vnode {
	const chip = statusChipOf(entry.status, entry.stepIndex);

	return m('p.status-chip', { class: `status-chip--${chip.mark}` }, [
		m('span.status-mark', { class: `status-mark--${chip.mark}`, 'aria-hidden': 'true' }),
		m('span', t(chip.key, { n: entry.stepIndex + 1, total: entry.stepCount })),
	]);
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
		captureException(err, { operation: 'lessonRow.reopen', mainId: id });
		reopenErrors.add(id);
	} finally {
		reopening.delete(id);
		m.redraw();
	}
}

/** "לשיעור" (or "פתיחה מחדש" for an ended lesson), with its hint and its retry. */
export function renderLessonActions(entry: ClassLessonEntry, name: string): m.Children {
	const label = (action: string): string => t('teacher.row.for', { action, name });
	const ended = entry.status === 'ended';
	const busy = reopening.has(entry.id);
	const hintId = `reopen-hint-${entry.id}`;

	return [
		m(
			'.teacher-home__row-actions',
			ended
				? m(
						'button.btn.btn--primary.btn--small',
						{
							type: 'button',
							'data-action': 'reopen',
							disabled: busy,
							'aria-busy': busy ? 'true' : undefined,
							'aria-describedby': hintId,
							'aria-label': label(t('teacher.row.reopen')),
							onclick: () => void handleReopen(entry.id),
						},
						busy ? t('console.busy_opening') : t('teacher.row.reopen'),
					)
				: m(
						m.route.Link,
						{
							class: 'btn btn--primary btn--small',
							href: `/t/${entry.id}`,
							'data-action': 'open',
							'aria-label': label(t('teacher.row.open')),
						},
						t('teacher.row.open'),
					),
		),
		ended ? m('p.teacher-home__hint', { id: hintId }, t('teacher.row.reopen_hint')) : null,
		reopenErrors.has(entry.id)
			? m('.teacher-home__error', { role: 'alert' }, [
					m('span', t('console.failed', { label: t('teacher.row.reopen') })),
					m(
						'button.btn.btn--tertiary.btn--small',
						{ type: 'button', onclick: () => void handleReopen(entry.id) },
						t('console.retry'),
					),
				])
			: null,
	];
}
