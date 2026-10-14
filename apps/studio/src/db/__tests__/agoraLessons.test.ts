import { describe, expect, it, vi } from 'vitest';
import { AgoraSceneKind, type AgoraScene } from '@freedi/shared-types';

vi.mock('@/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
	collection: vi.fn(),
	doc: vi.fn(),
	getDoc: vi.fn(),
	getDocs: vi.fn(),
	query: vi.fn(),
	updateDoc: vi.fn(),
	where: vi.fn(),
}));

import { withSceneVideos } from '../agoraLessons';

const scene = (sceneId: string): AgoraScene => ({
	sceneId,
	kind: AgoraSceneKind.intro,
	title: sceneId,
	text: '',
	imageUrls: [],
	dialogue: [],
});

describe('withSceneVideos', () => {
	it('replaces the list of one scene and leaves the others untouched', () => {
		const scenes = [scene('a'), { ...scene('b'), youtubeVideos: [{ videoId: 'bbbbbbbbbbb' }] }];
		const next = withSceneVideos(scenes, 'a', [{ videoId: 'aaaaaaaaaaa', startSeconds: 5 }]);

		expect(next[0].youtubeVideos).toEqual([{ videoId: 'aaaaaaaaaaa', startSeconds: 5 }]);
		expect(next[1]).toBe(scenes[1]);
		expect(scenes[0].youtubeVideos).toBeUndefined();
	});

	it('can empty a scene', () => {
		const scenes = [{ ...scene('a'), youtubeVideos: [{ videoId: 'aaaaaaaaaaa' }] }];

		expect(withSceneVideos(scenes, 'a', [])[0].youtubeVideos).toEqual([]);
	});
});
