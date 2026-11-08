import type { ClassGame } from '@freedi/shared-types';
import { subscribeToGame, subscribeToPlan } from '@/lib/classPlans';
import { captureException } from '@/lib/sentry';
import { getUserState } from '@/lib/user';
import type { Unsubscribe } from '@/lib/firebase';
import { setGame } from './planSource';

/**
 * The live feeds of the game screen (docs/ia/join-class-lesson-plan.md 7): the game doc
 * itself and its plan's title (the back link). Split from planController.ts, which owns the
 * screen's state and reacts through these handlers.
 */

export interface GameWatchHandlers {
	/** The plan's title, "" while the plan doc is unreadable. */
	onPlanTitle: (title: string) => void;
	/** The game doc, its owner confirmed (called again on every change). */
	onGame: (game: ClassGame) => void;
	/** The game is missing or not the caller's. */
	onDenied: () => void;
	onError: () => void;
}

/** Watches the plan title and the game; the returned function stops both. */
export function watchGame(
	planId: string,
	gameId: string,
	handlers: GameWatchHandlers,
): Unsubscribe {
	const stopPlan = subscribeToPlan(
		planId,
		(plan) => handlers.onPlanTitle(plan?.title ?? ''),
		(err) => captureException(err, { operation: 'planScreen.planTitleListener', planId }),
	);
	const stopGame = subscribeToGame(
		planId,
		gameId,
		(game) => {
			if (!game || game.ownerUid !== getUserState().user?.uid) {
				setGame(null);
				handlers.onDenied();

				return;
			}
			setGame(game);
			handlers.onGame(game);
		},
		(err) => {
			captureException(err, { operation: 'planScreen.gameListener', planId, gameId });
			if ((err as { code?: string }).code === 'permission-denied') handlers.onDenied();
			else handlers.onError();
		},
	);

	return () => {
		stopPlan();
		stopGame();
	};
}
