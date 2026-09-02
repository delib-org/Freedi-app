import { AgoraSessionMode } from '../models/agora/agoraEnums';
import { AGORA_CYCLE } from '../models/agora/agoraConstants';
import { resolveSessionFlow, scriptToFlow } from '../models/agora/sessionFlow';
import { ODYSSEY_EVENT_SCRIPT } from '../models/odyssey/odysseyGameScript';

describe('resolveSessionFlow', () => {
	describe('the legacy fold — sessions written before flows existed', () => {
		it('runs a classroom lesson exactly as it always did', () => {
			const flow = resolveSessionFlow({});

			expect(flow).toEqual({
				stances: true,
				needs: true,
				elders: true,
				rounds: AGORA_CYCLE.ROUNDS,
				ratingsPerRound: AGORA_CYCLE.RATINGS_PER_ROUND,
				voting: true,
				framing: false,
				scoreMode: 'bridging',
			});
		});

		it('treats an absent sessionMode as classroom', () => {
			expect(resolveSessionFlow({})).toEqual(
				resolveSessionFlow({ sessionMode: AgoraSessionMode.classroom }),
			);
		});

		it('keeps a civic square without needs or elders, as the old conditionals did', () => {
			const flow = resolveSessionFlow({ sessionMode: AgoraSessionMode.civic });

			expect(flow.needs).toBe(false);
			expect(flow.elders).toBe(false);
			// but still with camps, and therefore still scored on bridging
			expect(flow.stances).toBe(true);
			expect(flow.scoreMode).toBe('bridging');
		});
	});

	describe('overrides', () => {
		it('lets a civic event turn the elders back on', () => {
			const flow = resolveSessionFlow({
				sessionMode: AgoraSessionMode.civic,
				flow: { elders: true },
			});

			expect(flow.elders).toBe(true);
			// and changes nothing else
			expect(flow.needs).toBe(false);
			expect(flow.rounds).toBe(AGORA_CYCLE.ROUNDS);
		});

		it('honours false, rather than falling through to the default', () => {
			const flow = resolveSessionFlow({ flow: { voting: false, needs: false } });

			expect(flow.voting).toBe(false);
			expect(flow.needs).toBe(false);
		});

		it('folds a partial flow over the defaults for the mode', () => {
			const flow = resolveSessionFlow({
				sessionMode: AgoraSessionMode.civic,
				flow: { rounds: 3 },
			});

			expect(flow.rounds).toBe(3);
			expect(flow.ratingsPerRound).toBe(AGORA_CYCLE.RATINGS_PER_ROUND);
		});
	});

	describe('scoreMode is derived from stances, never stored', () => {
		it('scores a camp-less civic room on convergence — it has stance baselines to measure', () => {
			expect(
				resolveSessionFlow({ sessionMode: AgoraSessionMode.civic, flow: { stances: false } })
					.scoreMode,
			).toBe('convergence');
		});

		it('scores a camp-less classroom or quick game on agreement — no camps, no before-picture', () => {
			expect(resolveSessionFlow({ flow: { stances: false } }).scoreMode).toBe('agreement');
		});

		it('scores a room with camps on bridging', () => {
			expect(resolveSessionFlow({ flow: { stances: true } }).scoreMode).toBe('bridging');
		});
	});
});

describe('scriptToFlow', () => {
	it('leaves a session unscripted when the organizer set nothing', () => {
		expect(scriptToFlow(undefined)).toBeUndefined();
		expect(scriptToFlow({})).toBeUndefined();
	});

	it('carries only the fields the organizer actually chose', () => {
		expect(scriptToFlow({ rounds: 3 })).toEqual({ rounds: 3 });
	});

	it('carries a deliberate false', () => {
		expect(scriptToFlow({ stancesEnabled: false })).toEqual({ stances: false });
	});

	it('projects the event preset into a camp-less, convergence-scored square', () => {
		const flow = scriptToFlow(ODYSSEY_EVENT_SCRIPT);
		const resolved = resolveSessionFlow({ sessionMode: AgoraSessionMode.civic, flow });

		expect(resolved.stances).toBe(false);
		expect(resolved.needs).toBe(false);
		expect(resolved.elders).toBe(false);
		expect(resolved.framing).toBe(true);
		expect(resolved.rounds).toBe(3);
		expect(resolved.scoreMode).toBe('convergence');
		// the preset says nothing about voting, so the event still ends with one
		expect(resolved.voting).toBe(true);
	});
});
