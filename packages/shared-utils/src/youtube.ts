import type { AgoraYoutubeVideo } from '@freedi/shared-types';

/** A YouTube video id is always 11 characters of [A-Za-z0-9_-] */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com',
	'youtu.be',
	'www.youtu.be',
]);

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** The most videos one scene can hold — a library shelf, not a playlist */
export const MAX_YOUTUBE_VIDEOS_PER_SCENE = 12;

export type YoutubeParseFailure = 'empty' | 'invalid_url' | 'not_youtube' | 'no_video_id';

export type YoutubeParseResult =
	| { ok: true; video: AgoraYoutubeVideo }
	| { ok: false; reason: YoutubeParseFailure };

/** "90", "1m30s", "1h2m3s" become seconds; undefined when it is not a time */
export function parseStartTime(raw: string | null | undefined): number | undefined {
	if (!raw) return undefined;
	const value = raw.trim().toLowerCase();
	if (/^\d+$/.test(value)) {
		const seconds = Number(value);

		return seconds > 0 ? seconds : undefined;
	}
	const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
	if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
	const seconds =
		Number(match[1] ?? 0) * SECONDS_PER_HOUR +
		Number(match[2] ?? 0) * SECONDS_PER_MINUTE +
		Number(match[3] ?? 0);

	return seconds > 0 ? seconds : undefined;
}

function idOrNull(candidate: string | null | undefined): string | null {
	return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Turn a pasted YouTube link into a video id (plus an optional start offset).
 * Understands watch?v=, youtu.be/, shorts/, embed/, live/ and v/ links, with
 * `t=` / `start=` in the query or the hash. Anything else is refused with a
 * reason the UI turns into a plain message — a link is never stored as typed.
 */
export function parseYoutubeUrl(input: string): YoutubeParseResult {
	const trimmed = input.trim();
	if (!trimmed) return { ok: false, reason: 'empty' };

	// A pasted link often lacks its scheme ("youtu.be/abc…")
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return { ok: false, reason: 'invalid_url' };
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		return { ok: false, reason: 'invalid_url' };
	}

	const host = url.hostname.toLowerCase();
	if (!YOUTUBE_HOSTS.has(host)) return { ok: false, reason: 'not_youtube' };

	const segments = url.pathname.split('/').filter(Boolean);
	let videoId: string | null = null;
	if (host.endsWith('youtu.be')) {
		videoId = idOrNull(segments[0]);
	} else if (segments[0] === 'watch') {
		videoId = idOrNull(url.searchParams.get('v'));
	} else if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')) {
		videoId = idOrNull(segments[1]);
	}
	if (!videoId) return { ok: false, reason: 'no_video_id' };

	const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
	const startSeconds = parseStartTime(
		url.searchParams.get('t') ??
			url.searchParams.get('start') ??
			hashParams.get('t') ??
			hashParams.get('start'),
	);

	return {
		ok: true,
		video: startSeconds ? { videoId, startSeconds } : { videoId },
	};
}

export interface EmbedOptions {
	/** Start playing (muted — phones refuse autoplay with sound) */
	autoplay?: boolean;
}

/**
 * The embed URL for a stored video. youtube-nocookie keeps tracking cookies
 * off until the student presses play; `playsinline` stops iOS from forcing
 * fullscreen; autoplay is always muted.
 */
export function youtubeEmbedUrl(video: AgoraYoutubeVideo, options: EmbedOptions = {}): string {
	const params = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1' });
	if (options.autoplay) {
		params.set('autoplay', '1');
		params.set('mute', '1');
	}
	if (video.startSeconds) params.set('start', String(Math.floor(video.startSeconds)));

	return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?${params.toString()}`;
}

/** A still frame for a list row — no player is loaded until someone asks */
export function youtubeThumbnailUrl(videoId: string): string {
	return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

/** Add a parsed video to a scene's list: a duplicate id is a no-op, the cap is enforced */
export function addYoutubeVideo(
	list: readonly AgoraYoutubeVideo[] | undefined,
	video: AgoraYoutubeVideo,
): AgoraYoutubeVideo[] {
	const current = list ?? [];
	if (current.some((existing) => existing.videoId === video.videoId)) return [...current];
	if (current.length >= MAX_YOUTUBE_VIDEOS_PER_SCENE) return [...current];

	return [...current, video];
}

export function removeYoutubeVideo(
	list: readonly AgoraYoutubeVideo[] | undefined,
	videoId: string,
): AgoraYoutubeVideo[] {
	return (list ?? []).filter((video) => video.videoId !== videoId);
}

/** Move one video a step up (-1) or down (+1); out-of-range moves leave the order alone */
export function moveYoutubeVideo(
	list: readonly AgoraYoutubeVideo[] | undefined,
	videoId: string,
	direction: -1 | 1,
): AgoraYoutubeVideo[] {
	const next = [...(list ?? [])];
	const from = next.findIndex((video) => video.videoId === videoId);
	const to = from + direction;
	if (from < 0 || to < 0 || to >= next.length) return next;
	[next[from], next[to]] = [next[to], next[from]];

	return next;
}

/** Which video a student's player shows: a self-picked one, else the class's, else the first */
export function pickShownVideo(
	videos: readonly AgoraYoutubeVideo[],
	classVideoId: string | undefined,
	ownPickId: string | undefined,
): AgoraYoutubeVideo | undefined {
	const byId = (id: string | undefined): AgoraYoutubeVideo | undefined =>
		id ? videos.find((video) => video.videoId === id) : undefined;

	return byId(ownPickId) ?? byId(classVideoId) ?? videos[0];
}
