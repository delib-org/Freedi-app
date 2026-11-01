import {
	getMainStatement,
	getSubQuestions,
	setMainStatementSetting,
	setSettingOnQuestions,
} from '@/lib/store';
import { getChallengeQuestion } from '@/lib/lessonCore';
import { gateOf } from '@/lib/classroom/classSettings';

/**
 * The lesson's gate, as the teacher moves it from the console's cog.
 * It is the same field the engine, the console, the projector and the student
 * summary read: `votingSettings.threshold` (challenge question, else the main
 * statement, else DEFAULT_GATE). Writing it on the main statement moves the
 * line for the whole lesson; if the challenge question carries its own value
 * (it wins when reading) that one is moved too, so the cog never goes stale.
 */

export const GATE_MIN = 0;
export const GATE_MAX = 1;
export const GATE_STEP = 0.05;
const GATE_WRITE_DEBOUNCE_MS = 300;

let writeTimer: number | null = null;

/** The value the slider is dragged to, shown until the snapshot catches up. */
let draft: number | null = null;

export function readLessonGate(): number {
	const stored = gateOf(getChallengeQuestion(getSubQuestions()), getMainStatement());
	if (draft !== null && Math.abs(draft - stored) < GATE_STEP / 2) draft = null;

	return draft ?? stored;
}

async function writeGateNow(value: number): Promise<void> {
	const main = getMainStatement();
	if (!main) return;
	const patch = { votingSettings: { threshold: value } };
	await setMainStatementSetting(main.statementId, patch as Partial<typeof main>);
	const challenge = getChallengeQuestion(getSubQuestions());
	if (challenge && typeof challenge.votingSettings?.threshold === 'number') {
		await setSettingOnQuestions([challenge.statementId], patch as Partial<typeof challenge>);
	}
}

/** Debounced write for a dragged slider; errors are logged, the next drag retries. */
export function writeLessonGate(value: number): void {
	if (!Number.isFinite(value)) return;
	draft = value;
	if (writeTimer !== null) window.clearTimeout(writeTimer);
	writeTimer = window.setTimeout(() => {
		writeTimer = null;
		writeGateNow(value).catch((error: unknown) => {
			console.error('[Gate] write failed:', error);
		});
	}, GATE_WRITE_DEBOUNCE_MS);
}
