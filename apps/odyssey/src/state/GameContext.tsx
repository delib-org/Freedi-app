import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	ReactNode,
} from 'react';
import {
	ODYSSEY_DEFAULT_GAME_ID,
	OdysseyAttitudeKey,
	OdysseyGameTranslation,
	OdysseyJourney,
} from '@freedi/shared-types';

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
const GAME_STORAGE_KEY = 'odyssey_game_id';

export function currentGameId(): string {
	if (typeof window === 'undefined') return ODYSSEY_DEFAULT_GAME_ID;

	// The URL is the authority when it names a game, and naming one is also how
	// you LEAVE an event: `?game=default` puts you back on the shared game.
	const named = new URLSearchParams(window.location.search).get('game');
	if (named) {
		try {
			sessionStorage.setItem(GAME_STORAGE_KEY, named);
		} catch {
			// Storage refused; the parameter still works for this page.
		}

		return named;
	}

	// Every in-app link is a plain path — `/compass`, `/map`, `/admin` — so the
	// query string is gone the moment anyone clicks anything. Without a memory,
	// opening an event and pressing "start" dropped you into the default game
	// silently, which is the worst way for this to fail: everything works, on
	// the wrong data.
	try {
		return sessionStorage.getItem(GAME_STORAGE_KEY) || ODYSSEY_DEFAULT_GAME_ID;
	} catch {
		return ODYSSEY_DEFAULT_GAME_ID;
	}
}
import { GameContent, loadGame, loadGameTexts, loadTranslation } from '../lib/game';
import { attitudeValue, loadGameEvaluations, myAttitudes, rateStance } from '../lib/evaluations';
import { loadJourney, saveJourney } from '../lib/journey';
import { localizeGame, localizeTexts, siblingChip } from '../lib/localizeGame';
import type { AttitudeMap } from '../lib/distance';
import { toFreediUser, useUser } from '../lib/user';
import { DEFAULT_TEXTS } from '../lib/defaultTexts';
import { getLang, onLangChange, type Lang } from '../i18n/i18n';

interface GameState {
	/** true while auth or the initial game load is in flight */
	loading: boolean;
	/** null after loading when no game was seeded yet. Display copy: already
	 *  in the player's language (falls back to Hebrew per field). */
	content: GameContent | null;
	/**
	 * The Hebrew source. Anything STORED or MATCHED (journey chips, elder value
	 * matching, the Agora hand-off) reads this, never `content`, so a sailor's
	 * answers mean the same thing in every language.
	 */
	canonicalContent: GameContent | null;
	/** The language `content` is displayed in. */
	lang: Lang;
	/** The canonical (Hebrew) chip at the same index as a displayed chip. */
	canonicalChip(questionId: string, displayedChip: string): string;
	/** The displayed chip at the same index as a stored (Hebrew) chip. */
	displayChip(questionId: string, canonicalChip: string): string;
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
	const [canonicalContent, setCanonicalContent] = useState<GameContent | null>(null);
	const [translation, setTranslation] = useState<OdysseyGameTranslation | null>(null);
	const [lang, setLang] = useState<Lang>(getLang);
	const [journey, setJourney] = useState<OdysseyJourney | null>(null);
	const [journeyPersisted, setJourneyPersisted] = useState(false);
	const [attitudes, setAttitudes] = useState<AttitudeMap>({});
	/** Screen texts for a signed-out visitor (the intro), from the game doc. */
	const [guestTexts, setGuestTexts] = useState<Record<string, string> | null>(null);
	// The language listener outlives any render; it reads the latest journey
	// from here rather than from a closure that saw an older one.
	const journeyRef = useRef<{ journey: OdysseyJourney | null; persisted: boolean }>({
		journey: null,
		persisted: false,
	});
	journeyRef.current = { journey, persisted: journeyPersisted };
	// A slow translation download must never overwrite a newer language choice.
	const translationRequest = useRef(0);

	const content = useMemo(
		() => (canonicalContent ? localizeGame(canonicalContent, translation) : null),
		[canonicalContent, translation],
	);

	// What text() reads: the full localized game once signed in; before that,
	// just the game's texts with their overlay — so an English or Arabic
	// visitor's intro is not in Hebrew.
	const screenTexts = useMemo(
		() =>
			content?.game.texts ?? (guestTexts ? localizeTexts(guestTexts, translation?.texts) : null),
		[content, guestTexts, translation],
	);

	const reload = useCallback(async () => {
		if (!user) {
			setCanonicalContent(null);
			setJourney(null);
			setJourneyPersisted(false);
			setAttitudes({});
			setLoading(false);
			try {
				const gameId = currentGameId();
				const requestId = ++translationRequest.current;
				const [texts, loadedTranslation] = await Promise.all([
					loadGameTexts(gameId),
					loadTranslation(gameId, getLang()),
				]);
				setGuestTexts(texts);
				if (requestId === translationRequest.current) setTranslation(loadedTranslation);
			} catch (error) {
				// The intro still reads, from DEFAULT_TEXTS.
				console.error('[Odyssey] could not load the intro texts:', error);
			}

			return;
		}
		setLoading(true);
		try {
			const gameId = currentGameId();
			const requestId = ++translationRequest.current;
			const [loadedContent, loadedJourney, evaluations, loadedTranslation] = await Promise.all([
				loadGame(gameId),
				loadJourney(user.uid, gameId),
				loadGameEvaluations(gameId),
				loadTranslation(gameId, getLang()),
			]);
			setCanonicalContent(loadedContent);
			if (requestId === translationRequest.current) setTranslation(loadedTranslation);
			setJourney(loadedJourney.journey);
			setJourneyPersisted(loadedJourney.persisted);
			setAttitudes(myAttitudes(evaluations, user.uid));
		} catch (error) {
			console.error('[Odyssey] load failed:', error);
			setCanonicalContent(null);
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		if (!authLoading) void reload();
	}, [authLoading, reload]);

	// Switching language reloads ONLY the overlay — the sea, the journey and
	// the evaluations are the same in every language.
	useEffect(
		() =>
			onLangChange(async (next) => {
				setLang(next);
				const requestId = ++translationRequest.current;
				const loaded = await loadTranslation(currentGameId(), next);
				if (requestId !== translationRequest.current) return;
				setTranslation(loaded);

				const { journey: current, persisted } = journeyRef.current;
				if (!current || !persisted || current.lang === next) return;
				const stamped = { ...current, lang: next };
				setJourney(stamped);
				try {
					await saveJourney(stamped);
				} catch (error) {
					console.error('[Odyssey] could not record the reading language:', error, {
						lang: next,
					});
				}
			}),
		[],
	);

	const value = useMemo<GameState>(
		() => ({
			loading: authLoading || loading,
			content,
			canonicalContent,
			lang,
			canonicalChip(questionId: string, displayedChip: string): string {
				return siblingChip(content, canonicalContent, questionId, displayedChip);
			},
			displayChip(questionId: string, canonicalChip: string): string {
				return siblingChip(canonicalContent, content, questionId, canonicalChip);
			},
			journey,
			attitudes,
			text(key: string): string {
				return screenTexts?.[key] ?? DEFAULT_TEXTS[key] ?? '';
			},
			async updateJourney(patch: Partial<OdysseyJourney>): Promise<void> {
				if (!journey) return;
				const next = {
					...journey,
					...patch,
					// The reading language rides along on every save — so the first
					// save records it, and a player who switched is caught up on the
					// next one even if the switch itself could not be written.
					lang: getLang(),
					displayName: user?.displayName?.split(' ')[0] ?? journey.displayName,
				};
				setJourney(next);
				setJourneyPersisted(true);
				await saveJourney(next);
			},
			async setAttitude(
				islandStatementId: string,
				stanceStatementId: string,
				attitude: OdysseyAttitudeKey,
			): Promise<void> {
				if (!user || !canonicalContent) return;
				// Optimistic mark — but remember what stood before, so a failed
				// write can put it back instead of leaving a lie on the screen.
				const previous = attitudes[stanceStatementId];
				setAttitudes((current) => ({
					...current,
					[stanceStatementId]: attitudeValue(attitude),
				}));
				try {
					await rateStance({
						gameId: canonicalContent.game.gameId,
						islandStatementId,
						stanceStatementId,
						attitude,
						user: toFreediUser(user),
					});
				} catch (error) {
					console.error('[Odyssey] rateStance failed — reverting local attitude:', error, {
						stanceStatementId,
						islandStatementId,
					});
					setAttitudes((current) => {
						const next = { ...current };
						if (previous === undefined) delete next[stanceStatementId];
						else next[stanceStatementId] = previous;

						return next;
					});
				}
			},
			reload,
		}),
		[
			authLoading,
			loading,
			content,
			canonicalContent,
			lang,
			journey,
			attitudes,
			user,
			reload,
			screenTexts,
		],
	);

	return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameState {
	const state = useContext(GameContext);
	if (!state) throw new Error('useGame outside GameProvider');

	return state;
}
