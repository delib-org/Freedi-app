import { extractYouTubeVideo } from '../youtubeLinks';

const ID = 'dQw4w9WgXcQ';
const EMBED = `https://www.youtube-nocookie.com/embed/${ID}`;

describe('extractYouTubeVideo', () => {
	it.each([
		[`https://www.youtube.com/watch?v=${ID}`],
		[`https://youtube.com/watch?v=${ID}`],
		[`https://m.youtube.com/watch?v=${ID}`],
		[`www.youtube.com/watch?v=${ID}`],
		[`https://www.youtube.com/watch?feature=share&v=${ID}`],
		[`https://youtu.be/${ID}`],
		[`https://youtu.be/${ID}?si=abc123`],
		[`https://www.youtube.com/shorts/${ID}`],
		[`https://www.youtube.com/embed/${ID}`],
		[`https://www.youtube-nocookie.com/embed/${ID}`],
	])('recognises %s', (url) => {
		const result = extractYouTubeVideo(url);

		expect(result?.videoId).toBe(ID);
		expect(result?.embedUrl).toBe(EMBED);
	});

	it('hides the link from the visible text', () => {
		const result = extractYouTubeVideo(`Watch this https://youtu.be/${ID} it explains it`);

		expect(result?.textWithoutLinks).toBe('Watch this it explains it');
	});

	it('returns empty text when the option is only a link', () => {
		expect(extractYouTubeVideo(`https://youtu.be/${ID}`)?.textWithoutLinks).toBe('');
	});

	it('removes every link but embeds the first video', () => {
		const other = 'abcdefghijk';
		const result = extractYouTubeVideo(`https://youtu.be/${ID} and https://youtu.be/${other}`);

		expect(result?.videoId).toBe(ID);
		expect(result?.textWithoutLinks).toBe('and');
	});

	it('keeps a start offset', () => {
		expect(extractYouTubeVideo(`https://youtu.be/${ID}?t=90`)?.embedUrl).toBe(`${EMBED}?start=90`);
		expect(extractYouTubeVideo(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.embedUrl).toBe(
			`${EMBED}?start=90`,
		);
	});

	it('ignores a start value it cannot read', () => {
		expect(extractYouTubeVideo(`https://youtu.be/${ID}?t=soon`)?.embedUrl).toBe(EMBED);
	});

	it('returns null for text without a YouTube link', () => {
		expect(extractYouTubeVideo('Plain option text')).toBeNull();
		expect(extractYouTubeVideo('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
		expect(extractYouTubeVideo('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
		expect(extractYouTubeVideo('https://www.youtube.com/watch?v=short')).toBeNull();
		expect(extractYouTubeVideo('')).toBeNull();
		expect(extractYouTubeVideo(undefined)).toBeNull();
	});
});
