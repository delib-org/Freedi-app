import { resolve } from 'node:path';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';

/**
 * Each answer on My position is a label over a native radio that fills it
 * (`inset: 0`). A label that is not a positioning context lets its radio cover
 * the whole page, and then every tap answers for that label.
 */

const css = compile(resolve(__dirname, '../_position-stops.scss')).css;

function declarationsOf(selector: string): string {
	const start = css.indexOf(`${selector} {`);

	return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

describe('position answers', () => {
	it('fills its label with the hidden radio', () => {
		const radio = declarationsOf('.visually-hidden-input');

		expect(radio).toContain('position: absolute');
		expect(radio).toContain('inset: 0');
	});

	it.each(['.position-stop', '.position__decline'])('%s contains its own radio', (label) => {
		expect(declarationsOf(label)).toContain('position: relative');
	});
});
