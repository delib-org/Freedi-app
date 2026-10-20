export interface YouTubeVideo {
	videoId: string;
	/** Privacy-enhanced embed URL (youtube-nocookie), with start offset when the link had one. */
	embedUrl: string;
	/** The original text with every YouTube link removed and whitespace tidied. */
	textWithoutLinks: string;
}

const YOUTUBE_NOCOOKIE_EMBED = 'https://www.youtube-nocookie.com/embed/';
const VIDEO_ID_PATTERN = '([A-Za-z0-9_-]{11})';
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// watch?v=ID, youtu.be/ID, /shorts/ID, /embed/ID - protocol and www/m are optional.
const YOUTUBE_LINK_SOURCE =
	'(?<![\\w/.@-])(?:https?:\\/\\/)?(?:(?:www\\.|m\\.)?youtube(?:-nocookie)?\\.com\\/(?:watch\\?(?:[^\\s#]*?&)?v=|shorts\\/|embed\\/)|youtu\\.be\\/)' +
	VIDEO_ID_PATTERN +
	'(?![A-Za-z0-9_-])[^\\s]*';

/** Turns "90", "90s" or "1h2m3s" into seconds; undefined when it is not a time. */
function parseStartSeconds(raw: string | null): number | undefined {
	if (!raw) return undefined;

	if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);

	const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
	if (!match || (!match[1] && !match[2] && !match[3])) return undefined;

	const [, hours = '0', minutes = '0', seconds = '0'] = match;

	return (
		parseInt(hours, 10) * SECONDS_PER_HOUR +
		parseInt(minutes, 10) * SECONDS_PER_MINUTE +
		parseInt(seconds, 10)
	);
}

function getStartSeconds(link: string): number | undefined {
	const queryStart = link.indexOf('?');
	if (queryStart === -1) return undefined;

	const params = new URLSearchParams(link.slice(queryStart + 1).split('#')[0]);

	return parseStartSeconds(params.get('t') ?? params.get('start'));
}

/**
 * Finds the first YouTube link in a piece of option text. Returns null when
 * there is none. The returned text has all YouTube links removed so the raw
 * URL is not shown next to the embedded player.
 */
export function extractYouTubeVideo(text: string | undefined | null): YouTubeVideo | null {
	if (!text) return null;

	const pattern = new RegExp(YOUTUBE_LINK_SOURCE, 'gi');
	const first = pattern.exec(text);
	if (!first) return null;

	const videoId = first[1];
	const start = getStartSeconds(first[0]);
	const embedUrl = `${YOUTUBE_NOCOOKIE_EMBED}${videoId}${start !== undefined ? `?start=${start}` : ''}`;
	const textWithoutLinks = text
		.replace(new RegExp(YOUTUBE_LINK_SOURCE, 'gi'), '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return { videoId, embedUrl, textWithoutLinks };
}
