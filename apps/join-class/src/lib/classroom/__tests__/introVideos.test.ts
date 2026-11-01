import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	INTRO_VIDEOS_MAX,
	INTRO_VIDEO_TITLE_MAX,
	introVideoEmbed,
	introVideoLabel,
	introVideoName,
	introVideosOf,
	projectorVideoOf,
} from '../introVideos';

const stmt = (settings: Record<string, unknown>): Statement =>
	({ statementId: 'm', statementSettings: settings }) as unknown as Statement;

const YT = 'https://youtu.be/abcDEF12345';

describe('introVideoEmbed', () => {
	it('turns every YouTube link form into a youtube-nocookie embed without autoplay', () => {
		const links = [
			'https://youtu.be/abcDEF12345',
			'https://www.youtube.com/watch?v=abcDEF12345&t=3',
			'https://youtube.com/embed/abcDEF12345',
			'https://m.youtube.com/shorts/abcDEF12345',
			'https://www.youtube-nocookie.com/embed/abcDEF12345',
		];
		for (const link of links) {
			const embed = introVideoEmbed(link);
			expect(embed?.kind).toBe('youtube');
			expect(embed?.src).toBe(
				'https://www.youtube-nocookie.com/embed/abcDEF12345?rel=0&playsinline=1',
			);
			expect(embed?.src).not.toContain('autoplay');
		}
	});

	it('plays a direct https mp4 or webm file in a video element', () => {
		expect(introVideoEmbed('https://x.test/a.mp4')).toEqual({
			kind: 'file',
			src: 'https://x.test/a.mp4',
		});
		expect(introVideoEmbed('https://x.test/dir/clip.WEBM?token=1')?.kind).toBe('file');
	});

	it('refuses http, other hosts, other files and junk', () => {
		for (const link of [
			'http://youtu.be/abcDEF12345',
			'http://x.test/a.mp4',
			'https://vimeo.com/123456',
			'https://drive.google.com/file/d/abc/view',
			'https://x.test/page.html',
			'https://evil.test/watch?v=abcDEF12345',
			'https://youtube.com.evil.test/watch?v=abcDEF12345',
			'https://www.youtube.com/watch?v=short',
			'javascript:alert(1)',
			'not a url',
			'',
			'   ',
		]) {
			expect(introVideoEmbed(link)).toBeNull();
		}
	});

	it('refuses a link longer than the limit', () => {
		expect(introVideoEmbed(`https://x.test/${'a'.repeat(600)}.mp4`)).toBeNull();
	});
});

describe('introVideosOf', () => {
	it('returns the saved videos in order, trimmed', () => {
		const videos = introVideosOf(
			stmt({
				introVideos: [
					{ id: 'b', title: '  Second  ', url: 'https://x.test/b.mp4' },
					{ id: 'a', title: 'First', url: YT },
				],
			}),
		);
		expect(videos.map((v) => v.id)).toEqual(['b', 'a']);
		expect(videos[0].title).toBe('Second');
	});

	it('drops entries that cannot be embedded and caps the list and the title', () => {
		const many = Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, title: '', url: YT }));
		expect(
			introVideosOf(
				stmt({ introVideos: [{ id: 'x', title: 't', url: 'https://vimeo.com/1' }, ...many] }),
			),
		).toHaveLength(INTRO_VIDEOS_MAX);
		const long = introVideosOf(
			stmt({ introVideos: [{ id: 'x', title: 'ש'.repeat(200), url: YT }] }),
		);
		expect(long[0].title).toHaveLength(INTRO_VIDEO_TITLE_MAX);
	});

	it('falls back to the retired videoUrl as one untitled video', () => {
		expect(introVideosOf(stmt({ videoUrl: YT }))).toEqual([{ id: 'legacy', title: '', url: YT }]);
	});

	it('prefers introVideos over videoUrl, even when the list is empty', () => {
		expect(introVideosOf(stmt({ introVideos: [], videoUrl: YT }))).toEqual([]);
	});

	it('ignores an invalid legacy link and a missing lesson', () => {
		expect(introVideosOf(stmt({ videoUrl: 'http://x.test/a.mp4' }))).toEqual([]);
		expect(introVideosOf(stmt({}))).toEqual([]);
		expect(introVideosOf(null)).toEqual([]);
	});
});

describe('projectorVideoOf', () => {
	const settings = (projectorVideoId: string | null | undefined): Record<string, unknown> => ({
		introVideos: [{ id: 'v1', title: 'One', url: YT }],
		lessonPlan: { steps: [], stepIndex: 1, projectorVideoId },
	});

	it('finds the chosen video', () => {
		expect(projectorVideoOf(stmt(settings('v1')))?.id).toBe('v1');
	});

	it('is null for the text, a missing id, a deleted video and no lesson', () => {
		expect(projectorVideoOf(stmt(settings(null)))).toBeNull();
		expect(projectorVideoOf(stmt(settings(undefined)))).toBeNull();
		expect(projectorVideoOf(stmt(settings('gone')))).toBeNull();
		expect(projectorVideoOf(null)).toBeNull();
	});
});

describe('names', () => {
	it('uses the title, else "n" without a number prefix on the label', () => {
		const titled = { id: 'a', title: 'איך זה נראה', url: YT };
		const bare = { id: 'b', title: '', url: YT };
		expect(introVideoName(titled, 1)).toBe('איך זה נראה');
		expect(introVideoLabel(titled, 2)).toBe('2. איך זה נראה');
		expect(introVideoLabel(bare, 2)).toBe(introVideoName(bare, 2));
		expect(introVideoLabel(bare, 2)).not.toMatch(/^2\./);
	});
});
