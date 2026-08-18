import { buildSummaryPreview } from '../summaryPreview';

describe('buildSummaryPreview', () => {
	it('skips headings so the teaser starts on the prose', () => {
		const { text } = buildSummaryPreview(
			'## The Answer in Brief\n\nThe group agreed to meet less.',
		);
		expect(text).toBe('The group agreed to meet less.');
	});

	it('strips bold, italics, code and links but keeps the words', () => {
		const { text } = buildSummaryPreview(
			'We chose **shorter meetings**, _weekly_, per `policy` — see [the notes](https://example.com).',
		);
		expect(text).toBe('We chose shorter meetings, weekly, per policy — see the notes.');
	});

	it('drops list markers and joins lines into one run of text', () => {
		const { text } = buildSummaryPreview('- first point\n- second point\n1. third point');
		expect(text).toBe('first point second point third point');
	});

	it('reports truncation when a heading was skipped', () => {
		const { isTruncated } = buildSummaryPreview('## A heading\n\nOne short line.');
		expect(isTruncated).toBe(true);
	});

	it('reports truncation when the prose runs past two lines', () => {
		const long = `${'word '.repeat(60)}end.`;
		expect(buildSummaryPreview(long).isTruncated).toBe(true);
	});

	it('does not claim truncation for a summary that fits', () => {
		const { text, isTruncated } = buildSummaryPreview('We agreed to meet less often.');
		expect(text).toBe('We agreed to meet less often.');
		expect(isTruncated).toBe(false);
	});

	it('falls back to heading text when the summary is only headings', () => {
		const { text } = buildSummaryPreview('## What Was Agreed\n### Budget');
		expect(text).toBe('What Was Agreed Budget');
	});

	it('caps the text it hands to the DOM', () => {
		const { text } = buildSummaryPreview('x'.repeat(2000));
		expect(text).toHaveLength(600);
	});
});
