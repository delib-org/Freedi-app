import { describe, expect, it } from 'vitest';
import { AgoraSceneKind, AgoraStage, type AgoraScene } from '@freedi/shared-types';
import {
	FILM_SKIP_AFTER_MS,
	filmSkippable,
	filmStart,
	openingFilmOf,
	playsOpeningFilm,
	skipCountdown,
} from '../openingFilm';

const scene = (kind: AgoraSceneKind, extra: Partial<AgoraScene> = {}): AgoraScene => ({
	sceneId: `s-${kind}`,
	kind,
	title: kind,
	text: '',
	imageUrls: [],
	dialogue: [],
	...extra,
});

describe('openingFilmOf', () => {
	it('takes the time-tunnel scene video and its picture', () => {
		const film = openingFilmOf({
			scenes: [
				scene(AgoraSceneKind.intro),
				scene(AgoraSceneKind.timeTunnel, {
					videoUrl: '/a.mp4',
					imageUrls: ['/a.webp'],
					title: 'T',
				}),
			],
		});
		expect(film).toEqual({ url: '/a.mp4', poster: '/a.webp', title: 'T' });
	});

	it('is null when the scenario has no film', () => {
		expect(openingFilmOf({ scenes: [scene(AgoraSceneKind.timeTunnel)] })).toBeNull();
		expect(
			openingFilmOf({ scenes: [scene(AgoraSceneKind.timeTunnel, { videoUrl: '  ' })] }),
		).toBeNull();
		expect(openingFilmOf(undefined)).toBeNull();
	});

	it('ignores a video on another kind of scene', () => {
		expect(
			openingFilmOf({ scenes: [scene(AgoraSceneKind.perspectiveA, { videoUrl: '/x.mp4' })] }),
		).toBeNull();
	});
});

describe('the film gate', () => {
	it('plays into framing only', () => {
		expect(playsOpeningFilm(AgoraStage.framing)).toBe(true);
		expect(playsOpeningFilm(AgoraStage.perspectives)).toBe(false);
		expect(playsOpeningFilm(AgoraStage.lobby)).toBe(false);
	});

	it('can be skipped after five seconds', () => {
		expect(filmSkippable(FILM_SKIP_AFTER_MS - 1)).toBe(false);
		expect(filmSkippable(FILM_SKIP_AFTER_MS)).toBe(true);
		expect(skipCountdown(0)).toBe(5);
		expect(skipCountdown(4200)).toBe(1);
		expect(skipCountdown(9000)).toBe(0);
	});

	it('starts with sound on the wall and muted on a phone', () => {
		expect(filmStart(true)).toBe('wall-sound');
		expect(filmStart(false)).toBe('phone-muted');
	});
});
