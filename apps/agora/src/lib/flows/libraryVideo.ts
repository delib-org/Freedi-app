import { AgoraStage } from '@freedi/shared-types';
import type {
	AgoraScene,
	AgoraSession,
	AgoraStagePlanItem,
	AgoraYoutubeVideo,
} from '@freedi/shared-types';

/**
 * The rules around the library video the teacher starts for the class —
 * pure, so the sheet, the strip, the wall and the phones read one decision.
 */
export type LibraryVideoState = NonNullable<AgoraSession['libraryVideo']>;

/**
 * A started video is "live" for this long. A phone that joins or reconnects
 * inside the window follows it and plays it; after that the stamp is history —
 * the video is still the class's last pick, but nothing auto-plays on a phone
 * (or the wall) that happens to open an hour later.
 */
export const LIBRARY_VIDEO_LIVE_MS = 20 * 60 * 1000;

/** A scene with more videos than this is folded behind "show all" in the sheet */
export const VIDEO_GROUP_COLLAPSE_AFTER = 3;

export function isLibraryVideoLive(video: LibraryVideoState | undefined, now: number): boolean {
	return video !== undefined && now - video.at < LIBRARY_VIDEO_LIVE_MS;
}

export interface VideoGroup {
	sceneId: string;
	title: string;
	videos: AgoraYoutubeVideo[];
	/** More than VIDEO_GROUP_COLLAPSE_AFTER: the sheet shows the first few and "show all" */
	collapsible: boolean;
}

/** Only the scenes that hold videos, in the lesson's own order */
export function videoGroups(scenes: readonly AgoraScene[]): VideoGroup[] {
	return scenes.flatMap((scene) => {
		const videos = scene.youtubeVideos ?? [];

		return videos.length === 0
			? []
			: [
					{
						sceneId: scene.sceneId,
						title: scene.title,
						videos: [...videos],
						collapsible: videos.length > VIDEO_GROUP_COLLAPSE_AFTER,
					},
				];
	});
}

/** 1-based position of a video in its scene, and the title the teacher gave it, if any */
export function videoLabelParts(
	scenes: readonly AgoraScene[],
	state: Pick<LibraryVideoState, 'sceneId' | 'videoId'>,
): { n: number; title?: string } | null {
	const scene = scenes.find((candidate) => candidate.sceneId === state.sceneId);
	const videos = scene?.youtubeVideos ?? [];
	const index = videos.findIndex((video) => video.videoId === state.videoId);
	if (index < 0) return null;

	return { n: index + 1, title: videos[index].title };
}

/** The stages where a student is mid-task: writing, rating or voting */
const TASK_STAGES: ReadonlySet<AgoraStage> = new Set([
	AgoraStage.question,
	AgoraStage.deliberation,
	AgoraStage.voting,
]);

export interface StartImpact {
	/** Starting would pull students off a stage they have not finished */
	interrupts: boolean;
	unfinished: number;
}

/**
 * What starting a video does to the room. The library is a place, like
 * "gather": the room's stage never changes. The only cost is students who are
 * mid-task on the current stage — those are named in a confirm.
 */
export function startImpact(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	progress: { done: number; total: number } | undefined,
): StartImpact {
	const item = plan[currentIndex];
	if (!item || !TASK_STAGES.has(item.stage) || !progress)
		return { interrupts: false, unfinished: 0 };
	const unfinished = Math.max(0, progress.total - progress.done);

	return { interrupts: unfinished > 0, unfinished };
}

/**
 * Stop races start. A stop clears the video only if what is stored was
 * started no later than the stop itself: a start pressed after the stop
 * carries a newer stamp and survives it, whichever write the server sees last.
 */
export function shouldClearLibraryVideo(existingAt: number | undefined, stopAt: number): boolean {
	return existingAt !== undefined && existingAt <= stopAt;
}
