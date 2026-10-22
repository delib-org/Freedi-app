import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/**
 * The lesson introduction's videos (IA 14.2): `statementSettings.introVideos`,
 * 0-5 titled links. One reader for every screen (`introVideosOf`), one embed
 * reader (`introVideoEmbed`). Lives outside classSettings.ts so the student
 * entry chunk does not carry it: only the lazy Opening step, the plan screen,
 * the console and the projector import it.
 */

export const INTRO_VIDEOS_MAX = 5;
export const INTRO_VIDEO_TITLE_MAX = 60;
export const MAX_VIDEO_URL_LENGTH = 500;

/** Id given to the old single `videoUrl` when it is read as a one-video list. */
export const LEGACY_VIDEO_ID = 'legacy';

export interface IntroVideo {
	id: string;
	title: string;
	url: string;
}

/** How a link plays: a YouTube embed (iframe) or a direct file (video element). */
export interface IntroEmbed {
	kind: 'youtube' | 'file';
	src: string;
}

const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com',
	'youtu.be',
]);
const YOUTUBE_ID = /^[\w-]{6,20}$/;
const DIRECT_FILE = /\.(mp4|webm)$/i;

function youtubeIdOf(url: URL): string | null {
	const host = url.hostname.toLowerCase();
	if (!YOUTUBE_HOSTS.has(host)) return null;
	const parts = url.pathname.split('/').filter(Boolean);
	let id: string | null | undefined = null;
	if (host === 'youtu.be') id = parts[0];
	else if (parts[0] === 'watch') id = url.searchParams.get('v');
	else if (parts[0] === 'embed' || parts[0] === 'shorts') id = parts[1];

	return id && YOUTUBE_ID.test(id) ? id : null;
}

/**
 * The one reader of a video link. https only; a YouTube link becomes a
 * youtube-nocookie embed (never set to play by itself), a direct https .mp4 / .webm plays in
 * a video element. Anything else (Vimeo, Drive, a web page, http, javascript:)
 * is refused: null means "never render this".
 */
export function introVideoEmbed(link: string): IntroEmbed | null {
	const trimmed = link.trim();
	if (trimmed === '' || trimmed.length > MAX_VIDEO_URL_LENGTH) return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:') return null;
	const id = youtubeIdOf(url);
	if (id) {
		return {
			kind: 'youtube',
			src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`,
		};
	}
	if (DIRECT_FILE.test(url.pathname)) return { kind: 'file', src: trimmed };

	return null;
}

function cleanTitle(value: unknown): string {
	return typeof value === 'string' ? value.trim().slice(0, INTRO_VIDEO_TITLE_MAX) : '';
}

/**
 * The lesson's videos in the teacher's order. Falls back to the retired single
 * `videoUrl` (as one untitled video) until a lesson is saved from the plan
 * screen. Entries that cannot be embedded are dropped, so a reader never has to
 * check again.
 */
export function introVideosOf(main: Statement | null | undefined): IntroVideo[] {
	const settings = main?.statementSettings;
	const saved = settings?.introVideos;
	if (Array.isArray(saved)) {
		const videos: IntroVideo[] = [];
		for (const entry of saved) {
			if (videos.length >= INTRO_VIDEOS_MAX) break;
			if (typeof entry?.id !== 'string' || typeof entry.url !== 'string') continue;
			if (!introVideoEmbed(entry.url)) continue;
			videos.push({ id: entry.id, title: cleanTitle(entry.title), url: entry.url.trim() });
		}

		return videos;
	}
	const legacy = settings?.videoUrl?.trim();

	return legacy && introVideoEmbed(legacy) ? [{ id: LEGACY_VIDEO_ID, title: '', url: legacy }] : [];
}

/** The video the projector is on, or null (the text). A deleted id resolves to null. */
export function projectorVideoOf(main: Statement | null | undefined): IntroVideo | null {
	const id = main?.statementSettings?.lessonPlan?.projectorVideoId;
	if (!id) return null;

	return introVideosOf(main).find((video) => video.id === id) ?? null;
}

/** "Video 2" for a video without a title, else the title. Same rule on every screen. */
export function introVideoName(video: IntroVideo, position: number): string {
	return video.title !== '' ? video.title : t('opening.video_n', { n: position });
}

/** "2. Title", or "Video 2" when untitled (no number prefix: it would read "2. Video 2"). */
export function introVideoLabel(video: IntroVideo, position: number): string {
	return video.title !== '' ? `${position}. ${video.title}` : t('opening.video_n', { n: position });
}
