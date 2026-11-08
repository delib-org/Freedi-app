import {
	addYoutubeVideo,
	MAX_YOUTUBE_VIDEOS_PER_SCENE,
	moveYoutubeVideo,
	parseStartTime,
	parseYoutubeUrl,
	pickShownVideo,
	removeYoutubeVideo,
	youtubeEmbedUrl,
} from '../youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYoutubeUrl', () => {
	it.each([
		[`https://www.youtube.com/watch?v=${ID}`],
		[`https://youtube.com/watch?feature=share&v=${ID}`],
		[`https://m.youtube.com/watch?v=${ID}&list=PL123`],
		[`https://youtu.be/${ID}`],
		[`https://youtu.be/${ID}?si=abcdef`],
		[`https://www.youtube.com/shorts/${ID}`],
		[`https://www.youtube.com/embed/${ID}`],
		[`https://www.youtube-nocookie.com/embed/${ID}`],
		[`https://www.youtube.com/live/${ID}`],
		[`youtu.be/${ID}`],
		[`  www.youtube.com/watch?v=${ID}  `],
	])('reads the id from %s', (link) => {
		const result = parseYoutubeUrl(link);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.video.videoId).toBe(ID);
	});

	it('reads the start offset in every shape', () => {
		const start = (link: string): number | undefined | 'fail' => {
			const result = parseYoutubeUrl(link);

			return result.ok ? result.video.startSeconds : 'fail';
		};
		expect(start(`https://www.youtube.com/watch?v=${ID}&t=90`)).toBe(90);
		expect(start(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toBe(90);
		expect(start(`https://youtu.be/${ID}?t=42`)).toBe(42);
		expect(start(`https://www.youtube.com/embed/${ID}?start=7`)).toBe(7);
		expect(start(`https://www.youtube.com/watch?v=${ID}#t=15`)).toBe(15);
		expect(start(`https://www.youtube.com/watch?v=${ID}`)).toBeUndefined();
	});

	it('refuses links that are not YouTube', () => {
		const refused = { ok: false, reason: 'not_youtube' };
		expect(parseYoutubeUrl('https://vimeo.com/12345678')).toEqual(refused);
		expect(parseYoutubeUrl(`https://evil.com/watch?v=${ID}`)).toEqual(refused);
		expect(parseYoutubeUrl(`https://youtube.com.evil.com/watch?v=${ID}`)).toEqual(refused);
	});

	it('refuses YouTube links with no usable id, and junk', () => {
		expect(parseYoutubeUrl('https://www.youtube.com/watch?v=short')).toEqual({
			ok: false,
			reason: 'no_video_id',
		});
		expect(parseYoutubeUrl('https://www.youtube.com/@channel')).toEqual({
			ok: false,
			reason: 'no_video_id',
		});
		expect(parseYoutubeUrl('')).toEqual({ ok: false, reason: 'empty' });
		expect(parseYoutubeUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'invalid_url' });
		expect(parseYoutubeUrl('not a link at all')).toEqual({ ok: false, reason: 'invalid_url' });
	});
});

describe('parseStartTime', () => {
	it('handles plain seconds, units and nonsense', () => {
		expect(parseStartTime('90')).toBe(90);
		expect(parseStartTime('1h2m3s')).toBe(3723);
		expect(parseStartTime('45s')).toBe(45);
		expect(parseStartTime('0')).toBeUndefined();
		expect(parseStartTime('abc')).toBeUndefined();
		expect(parseStartTime(null)).toBeUndefined();
	});
});

describe('youtubeEmbedUrl', () => {
	it('uses the no-cookie host, plays inline and only ever autoplays muted', () => {
		const url = new URL(youtubeEmbedUrl({ videoId: ID, startSeconds: 12 }, { autoplay: true }));
		expect(url.hostname).toBe('www.youtube-nocookie.com');
		expect(url.pathname).toBe(`/embed/${ID}`);
		expect(url.searchParams.get('playsinline')).toBe('1');
		expect(url.searchParams.get('autoplay')).toBe('1');
		expect(url.searchParams.get('mute')).toBe('1');
		expect(url.searchParams.get('start')).toBe('12');
	});

	it('does not autoplay unless asked', () => {
		const url = new URL(youtubeEmbedUrl({ videoId: ID }));
		expect(url.searchParams.has('autoplay')).toBe(false);
		expect(url.searchParams.has('start')).toBe(false);
	});
});

describe('list helpers', () => {
	const a = { videoId: 'aaaaaaaaaaa' };
	const b = { videoId: 'bbbbbbbbbbb' };
	const c = { videoId: 'ccccccccccc' };

	it('adds without duplicates and respects the cap', () => {
		expect(addYoutubeVideo([a], b)).toEqual([a, b]);
		expect(addYoutubeVideo([a], a)).toEqual([a]);
		expect(addYoutubeVideo(undefined, a)).toEqual([a]);
		const full = Array.from({ length: MAX_YOUTUBE_VIDEOS_PER_SCENE }, (_unused, index) => ({
			videoId: String(index).padStart(11, 'x'),
		}));
		expect(addYoutubeVideo(full, c)).toHaveLength(MAX_YOUTUBE_VIDEOS_PER_SCENE);
	});

	it('removes and reorders', () => {
		expect(removeYoutubeVideo([a, b], a.videoId)).toEqual([b]);
		expect(moveYoutubeVideo([a, b, c], c.videoId, -1)).toEqual([a, c, b]);
		expect(moveYoutubeVideo([a, b, c], a.videoId, -1)).toEqual([a, b, c]);
		expect(moveYoutubeVideo([a, b, c], c.videoId, 1)).toEqual([a, b, c]);
	});

	it('shows own pick, then the class video, then the first', () => {
		const list = [a, b, c];
		expect(pickShownVideo(list, b.videoId, c.videoId)).toBe(c);
		expect(pickShownVideo(list, b.videoId, undefined)).toBe(b);
		expect(pickShownVideo(list, 'gone', undefined)).toBe(a);
		expect(pickShownVideo([], undefined, undefined)).toBeUndefined();
	});
});
