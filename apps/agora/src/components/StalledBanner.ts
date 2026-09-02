import m from 'mithril';
import { t } from '../lib/i18n';
import { getStalledWrites } from '../lib/confirmedWrite';

/**
 * The shared voice of `lib/confirmedWrite.ts`, renderable on any screen.
 *
 * A write still in the air after eight seconds. Silence is the failure mode
 * here — Firestore queues rather than rejects — so the student is told plainly
 * rather than left with a UI that claims their work is saved. It first lived
 * only inside the deliberation HUD, which meant a vote wedged on the voting
 * screen, or a topic save wedged in the editor, stalled with no HUD anywhere
 * to say so.
 *
 * Reuses the HUD's own class so every screen states it in the same type and
 * the same tone: a status line, not an alarm.
 */
export function stalledBanner(): m.Children {
	const stalledWrites = getStalledWrites();
	if (stalledWrites.length === 0) return null;

	return m(
		'.delib-hud__stalled',
		{ role: 'status' },
		t(stalledWrites[0]?.labelKey ?? 'delib.saving_generic'),
	);
}
