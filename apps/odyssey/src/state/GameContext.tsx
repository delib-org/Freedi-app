import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	ReactNode,
} from 'react';
import { ODYSSEY_DEFAULT_GAME_ID, OdysseyAttitudeKey, OdysseyJourney } from '@freedi/shared-types';

/**
 * Which game this browser is playing.
 *
 * One event is one game document — its own islands, its own script, its own
 * squares — so an organizer running an event needs a way to point people at
 * theirs. A query parameter is the whole mechanism: `?game=<id>`, absent means
 * the default game, and every id the app touches (content, journey,
 * evaluations, the admin screen) comes from here so the three can never end up
 * reading different games.
 */
export function currentGameId(): string {
	if (typeof window === 'undefined') return ODYSSEY_DEFAULT_GAME_ID;

	return new URLSearchParams(window.location.search).get('game') || ODYSSEY_DEFAULT_GAME_ID;
}
import { GameContent, loadGame } from '../lib/game';
import { attitudeValue, loadGameEvaluations, myAttitudes, rateStance } from '../lib/evaluations';
import { loadJourney, saveJourney } from '../lib/journey';
import type { AttitudeMap } from '../lib/distance';
import { toFreediUser, useUser } from '../lib/user';
import { DEFAULT_TEXTS } from '../lib/defaults';

interface GameState {
	/** true while auth or the initial game load is in flight */
	loading: boolean;
	/** null after loading when no game was seeded yet */
	content: GameContent | null;
	journey: OdysseyJourney | null;
	/** stance statementId → my evaluation value (-1..1) */
	attitudes: AttitudeMap;
	text(key: string): string;
	updateJourney(patch: Partial<OdysseyJourney>): Promise<void>;
	setAttitude(
		islandStatementId: string,
		stanceStatementId: string,
		attitude: OdysseyAttitudeKey,
	): Promise<void>;
	reload(): Promise<void>;
}

const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
	const { user, loading: authLoading } = useUser();
	const [loading, setLoading] = useState(true);
	const [content, setContent] = useState<GameContent | null>(null);
	const [journey, setJourney] = useState<OdysseyJourney | null>(null);
	const [attitudes, setAttitudes] = useState<AttitudeMap>({});

	const reload = useCallback(async () => {
		if (!user) {
			setContent(null);
			setJourney(null);
			setAttitudes({});
			setLoading(false);

			return;
		}
		setLoading(true);
		try {
			const gameId = currentGameId();
			const [loadedContent, loadedJourney, evaluations] = await Promise.all([
				loadGame(gameId),
				loadJourney(user.uid, gameId),
				loadGameEvaluations(gameId),
			]);
			setContent(loadedContent);
			setJourney(loadedJourney);
			setAttitudes(myAttitudes(evaluations, user.uid));
		} catch (error) {
			console.error('[Odyssey] load failed:', error);
			setContent(null);
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		if (!authLoading) void reload();
	}, [authLoading, reload]);

	const value = useMemo<GameState>(
		() => ({
			loading: authLoading || loading,
			content,
			journey,
			attitudes,
			text(key: string): string {
				return content?.game.texts[key] ?? DEFAULT_TEXTS[key] ?? '';
			},
			async updateJourney(patch: Partial<OdysseyJourney>): Promise<void> {
				if (!journey) return;
				const next = {
					...journey,
					...patch,
					displayName: user?.displayName?.split(' ')[0] ?? journey.displayName,
				};
				setJourney(next);
				await saveJourney(next);
			},
			async setAttitude(
				islandStatementId: string,
				stanceStatementId: string,
				attitude: OdysseyAttitudeKey,
			): Promise<void> {
				if (!user || !content) return;
				setAttitudes((current) => ({
					...current,
					[stanceStatementId]: attitudeValue(attitude),
				}));
				await rateStance({
					gameId: content.game.gameId,
					islandStatementId,
					stanceStatementId,
					attitude,
					user: toFreediUser(user),
				});
			},
			reload,
		}),
		[authLoading, loading, content, journey, attitudes, user, reload],
	);

	return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameState {
	const state = useContext(GameContext);
	if (!state) throw new Error('useGame outside GameProvider');

	return state;
}
