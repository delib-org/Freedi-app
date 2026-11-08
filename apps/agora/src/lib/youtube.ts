/**
 * YouTube link rules live in shared-utils so the lesson editor here and
 * Studio parse a pasted link exactly the same way.
 */
export {
	addYoutubeVideo,
	MAX_YOUTUBE_VIDEOS_PER_SCENE,
	moveYoutubeVideo,
	parseStartTime,
	parseYoutubeUrl,
	pickShownVideo,
	removeYoutubeVideo,
	youtubeEmbedUrl,
	youtubeThumbnailUrl,
} from '@freedi/shared-utils';
export type { EmbedOptions, YoutubeParseFailure, YoutubeParseResult } from '@freedi/shared-utils';
