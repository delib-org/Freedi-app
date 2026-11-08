import { AgoraSceneKind, AgoraStage, type AgoraScene } from '@freedi/shared-types';

/**
 * The scenario's opening film — the time-tunnel scene's video. It is the
 * full-screen "travel card" on the way from the lobby into the story, on
 * every phone and on the wall, and the library shelf keeps it for a replay.
 * Pure: no DOM, no storage — `components/OpeningFilm.ts` plays it.
 */
export interface OpeningFilm {
	url: string;
	/** The scene's first picture: the instant frame before the film starts */
	poster?: string;
	title: string;
}

/** A student who joined late, or a class in a hurry, may leave the film after this long */
export const FILM_SKIP_AFTER_MS = 5000;
/** A film that never ends (a stalled network) still lets the class through */
export const FILM_FAILSAFE_MS = 180000;
/** A film that cannot load shows its picture this long, then lets the class through */
export const FILM_ERROR_HOLD_MS = 2500;

/** The film of a topic, or null — any scenario with an opening film has one, not only the French Revolution */
export function openingFilmOf(
	topic: { scenes: readonly AgoraScene[] } | undefined,
): OpeningFilm | null {
	const scene = topic?.scenes.find(
		(candidate) => candidate.kind === AgoraSceneKind.timeTunnel && !!candidate.videoUrl?.trim(),
	);
	if (!scene?.videoUrl) return null;

	return { url: scene.videoUrl, poster: scene.imageUrls[0], title: scene.title };
}

/** The film plays when the teacher moves the class from the lobby into the story — and nowhere else */
export function playsOpeningFilm(stage: AgoraStage): boolean {
	return stage === AgoraStage.framing;
}

export function filmSkippable(elapsedMs: number): boolean {
	return elapsedMs >= FILM_SKIP_AFTER_MS;
}

/** Whole seconds left until the skip button appears; 0 once it has */
export function skipCountdown(elapsedMs: number): number {
	return Math.max(0, Math.ceil((FILM_SKIP_AFTER_MS - elapsedMs) / 1000));
}

/**
 * How a screen starts the film. The wall plays it with sound; a phone starts
 * muted (a browser lets only muted video autoplay) and offers one tap for
 * sound. When even that is refused the screen shows a tap-to-play button.
 */
export type FilmStart = 'wall-sound' | 'phone-muted';

export function filmStart(wall: boolean): FilmStart {
	return wall ? 'wall-sound' : 'phone-muted';
}
