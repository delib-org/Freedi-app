import m from 'mithril';
import { t } from '@/lib/i18n';
import { captureException } from '@/lib/sentry';
import { applyRemoval } from '@/lib/removal';
import { removalKey, type RemovalTarget } from '@/lib/removalTargets';

/**
 * Remove and Restore (docs/ia/join-class-remove-lessons.md 3, 6). "הסרה" hides a plan, a game or a
 * lesson from the teacher's lists; it is undoable, so there is no confirm (the HideControl
 * principle). Right after a remove the row turns into a done line with "החזרה" until the
 * teacher leaves the screen. One word, "החזרה", is both the undo and the restore.
 */

const busy = new Set<string>();
const failed = new Map<string, boolean>();
/** Items removed on this screen: key -> name, shown as a done line. */
const doneHere = new Map<string, string>();
let announcement = '';

/** A screen opened: forget what was removed on the last one. */
export function resetRemoveState(): void {
	busy.clear();
	failed.clear();
	doneHere.clear();
	announcement = '';
}

/** True while the item is the done line of this screen. */
export function wasRemovedHere(target: RemovalTarget): boolean {
	return doneHere.has(removalKey(target));
}

async function run(target: RemovalTarget, name: string, removed: boolean): Promise<void> {
	const key = removalKey(target);
	if (busy.has(key)) return;
	busy.add(key);
	failed.delete(key);
	m.redraw();
	try {
		await applyRemoval(target, removed);
		if (removed) doneHere.set(key, name);
		else doneHere.delete(key);
		announcement = removed
			? t('teacher.row.removed_line', { name })
			: t('teacher.row.for', { action: t('teacher.row.restore'), name });
	} catch (err) {
		captureException(err, {
			operation: removed ? 'removeControl.remove' : 'removeControl.restore',
			target: key,
		});
		failed.set(key, removed);
	} finally {
		busy.delete(key);
		m.redraw();
	}
}

function renderFailure(target: RemovalTarget, name: string): m.Children {
	const key = removalKey(target);
	const removed = failed.get(key);
	if (removed === undefined) return null;
	const label = t(removed ? 'teacher.row.remove' : 'teacher.row.restore');

	return m('.teacher-home__error', { role: 'alert' }, [
		m('span', t('console.failed', { label })),
		m(
			'button.btn.btn--tertiary.btn--small',
			{ type: 'button', onclick: () => void run(target, name, removed) },
			t('console.retry'),
		),
	]);
}

/** The "Restore" button. Used on a done line, in "הוסרו" and on the removed strips. */
export function renderRestore(target: RemovalTarget, name: string): m.Children {
	const key = removalKey(target);

	return [
		m(
			'button.btn.btn--secondary.btn--small.remove-control__restore',
			{
				type: 'button',
				'data-action': 'restore',
				disabled: busy.has(key),
				'aria-busy': busy.has(key) ? 'true' : undefined,
				'aria-label': t('teacher.row.for', { action: t('teacher.row.restore'), name }),
				onclick: () => void run(target, name, false),
			},
			t('teacher.row.restore'),
		),
		renderFailure(target, name),
	];
}

/** The "Remove" button, or the done line (with "Restore") once the item was removed on this screen. */
export function renderRemove(target: RemovalTarget, name: string): m.Children {
	const key = removalKey(target);
	if (doneHere.has(key)) {
		return m('.remove-control__done', { 'data-removed': key }, [
			m('span.remove-control__done-text', t('teacher.row.removed_line', { name })),
			renderRestore(target, name),
		]);
	}

	return [
		m(
			'button.btn.btn--tertiary.btn--small.remove-control__remove',
			{
				type: 'button',
				'data-action': 'remove',
				disabled: busy.has(key),
				'aria-busy': busy.has(key) ? 'true' : undefined,
				'aria-label': t('teacher.row.for', { action: t('teacher.row.remove'), name }),
				onclick: () => void run(target, name, true),
			},
			t('teacher.row.remove'),
		),
		renderFailure(target, name),
	];
}

/** The strip of a removed plan or game screen: what it is, and "Restore". */
export function renderRemovedStrip(textKey: string, target: RemovalTarget, name: string): m.Vnode {
	return m('.remove-control__strip', { role: 'status', 'data-removed-strip': removalKey(target) }, [
		m('span.remove-control__strip-text', t(textKey)),
		renderRestore(target, name),
	]);
}

/** One polite live region for the last remove or restore of the screen. */
export function renderRemoveAnnouncer(): m.Vnode {
	return m('.visually-hidden', { role: 'status', 'aria-live': 'polite' }, announcement);
}
