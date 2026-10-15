import { describe, expect, it } from 'vitest';
import {
	AgoraSceneKind,
	AgoraStage,
	type AgoraScene,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import {
	isLibraryVideoLive,
	LIBRARY_VIDEO_LIVE_MS,
	shouldClearLibraryVideo,
	startImpact,
	videoGroups,
	videoLabelParts,
} from '../flows/libraryVideo';

const scene = (sceneId: string, count: number): AgoraScene => ({
	sceneId,
	kind: AgoraSceneKind.intro,
	title: sceneId,
	text: '',
	imageUrls: [],
	dialogue: [],
	youtubeVideos:
		count === 0
			? undefined
			: Array.from({ length: count }, (_unused, index) => ({
					videoId: `${sceneId}${index}`.padEnd(11, 'x'),
				})),
});

const item = (stage: AgoraStage): AgoraStagePlanItem =>
	({ itemId: stage, stage }) as AgoraStagePlanItem;

describe('videoGroups', () => {
	it('lists only scenes with videos and folds the long ones', () => {
		const groups = videoGroups([scene('a', 0), scene('b', 2), scene('c', 5)]);

		expect(groups.map((group) => group.sceneId)).toEqual(['b', 'c']);
		expect(groups.map((group) => group.collapsible)).toEqual([false, true]);
	});

	it('keeps exactly three open', () => {
		expect(videoGroups([scene('a', 3)])[0].collapsible).toBe(false);
		expect(videoGroups([scene('a', 4)])[0].collapsible).toBe(true);
	});
});

describe('videoLabelParts', () => {
	it('gives the 1-based position, or null for a video that is gone', () => {
		const scenes = [scene('b', 3)];
		const videos = scenes[0].youtubeVideos ?? [];

		expect(videoLabelParts(scenes, { sceneId: 'b', videoId: videos[1].videoId })).toEqual({
			n: 2,
			title: undefined,
		});
		expect(videoLabelParts(scenes, { sceneId: 'b', videoId: 'nope' })).toBeNull();
		expect(videoLabelParts(scenes, { sceneId: 'zzz', videoId: videos[0].videoId })).toBeNull();
	});
});

describe('isLibraryVideoLive', () => {
	const video = { sceneId: 's', videoId: 'v', at: 1_000_000 };

	it('is live inside the window and stale after it', () => {
		expect(isLibraryVideoLive(video, video.at + 1000)).toBe(true);
		expect(isLibraryVideoLive(video, video.at + LIBRARY_VIDEO_LIVE_MS)).toBe(false);
		expect(isLibraryVideoLive(undefined, video.at)).toBe(false);
	});
});

describe('startImpact', () => {
	const plan = [item(AgoraStage.perspectives), item(AgoraStage.question), item(AgoraStage.voting)];

	it('does not interrupt the library itself', () => {
		expect(startImpact(plan, 0, { done: 0, total: 20 })).toEqual({
			interrupts: false,
			unfinished: 0,
		});
	});

	it('interrupts a stage students have not finished, and names how many', () => {
		expect(startImpact(plan, 1, { done: 14, total: 26 })).toEqual({
			interrupts: true,
			unfinished: 12,
		});
		expect(startImpact(plan, 2, { done: 1, total: 4 }).interrupts).toBe(true);
	});

	it('does not interrupt a finished stage or one with unknown progress', () => {
		expect(startImpact(plan, 1, { done: 26, total: 26 }).interrupts).toBe(false);
		expect(startImpact(plan, 1, undefined).interrupts).toBe(false);
	});
});

describe('shouldClearLibraryVideo', () => {
	it('clears what the stop could see, never a start made after it', () => {
		expect(shouldClearLibraryVideo(100, 100)).toBe(true);
		expect(shouldClearLibraryVideo(90, 100)).toBe(true);
		expect(shouldClearLibraryVideo(101, 100)).toBe(false);
		expect(shouldClearLibraryVideo(undefined, 100)).toBe(false);
	});
});
