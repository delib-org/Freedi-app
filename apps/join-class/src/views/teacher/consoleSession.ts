import m from 'mithril';
import { ensureUser } from '@/lib/user';
import {
	getMainStatement,
	loadMainStatement,
	subscribeMainStatement,
	subscribeSubQuestions,
} from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { ensureClassCode } from '@/lib/lesson';
import { watchClass } from '@/lib/classroom/classState';
import type { Unsubscribe } from '@/lib/firebase';
import { resetConsoleState, stopWatchingOptions } from './consoleState';

/**
 * Opening and closing the console for one lesson (shared by the console and the
 * table sheet): sign in, load the workspace, confirm the viewer is its admin,
 * make sure it has a join code, and start the live listeners (workspace,
 * sub-questions, tables, roster) plus the one-second tick that moves the
 * lesson clock and the speaker timers.
 */

export type SessionStatus = 'loading' | 'ready' | 'failed' | 'redirected';

const TICK_MS = 1000;
const CLOCK_KEY_PREFIX = 'joinClass.lessonStart.';

export const session: { status: SessionStatus; mainId: string; startedAt: number } = {
	status: 'loading',
	mainId: '',
	startedAt: Date.now(),
};

let stops: Unsubscribe[] = [];
let stopClass: (() => void) | null = null;
let tick: number | null = null;
let generation = 0;

/** When the teacher first opened this lesson (kept across reloads, per browser). */
function readStartedAt(mainId: string): number {
	const now = Date.now();
	try {
		const key = `${CLOCK_KEY_PREFIX}${mainId}`;
		const stored = Number(window.localStorage.getItem(key));
		if (Number.isFinite(stored) && stored > 0) return stored;
		window.localStorage.setItem(key, String(now));
	} catch (err) {
		console.error('[TeacherConsole] lesson clock storage unavailable:', err);
	}

	return now;
}

export function closeConsole(): void {
	generation += 1;
	for (const stop of stops) stop();
	stops = [];
	stopClass?.();
	stopClass = null;
	stopWatchingOptions();
	if (tick !== null) {
		window.clearInterval(tick);
		tick = null;
	}
}

export async function openConsole(mainId: string): Promise<void> {
	closeConsole();
	const mine = generation;
	resetConsoleState(mainId);
	session.status = 'loading';
	session.mainId = mainId;
	session.startedAt = readStartedAt(mainId);
	m.redraw();
	try {
		await ensureUser();
		if (getMainStatement()?.statementId !== mainId) await loadMainStatement(mainId);
		const main = getMainStatement();
		if (!main || main.statementId !== mainId) {
			session.status = 'failed';

			return;
		}
		await checkAdminStatus(mainId, main.creatorId);
		if (!isAdmin()) {
			session.status = 'redirected';
			m.route.set(`/m/${mainId}`);

			return;
		}
		// Admins get the join code on open (a no-op when it already exists).
		await ensureClassCode(mainId).catch((err: unknown) => {
			console.error('[TeacherConsole] ensureClassCode failed:', err);
		});
		await loadMainStatement(mainId);
		if (mine !== generation) return;
		stops = [subscribeMainStatement(mainId), subscribeSubQuestions(mainId)];
		stopClass = watchClass(mainId, 'teacher');
		tick = window.setInterval(() => m.redraw(), TICK_MS);
		session.status = 'ready';
	} catch (err) {
		console.error('[TeacherConsole] load failed:', err);
		session.status = 'failed';
	} finally {
		m.redraw();
	}
}
