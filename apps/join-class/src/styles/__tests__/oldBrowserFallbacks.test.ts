import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Safari < 14.1 and Chrome < 87 ignore `inset` and the logical `inset-*`
 * properties, so a `position: fixed` rating sheet written with them alone has no
 * edges and the proposals to rate never show (Trello EBhCZirF). `inset` is
 * lowered at build time (vite cssTarget); the logical ones keep a physical twin.
 */

function read(name: string): string {
	return readFileSync(new URL(name, import.meta.url), 'utf8');
}

describe('old browsers can still see the rating sheet and notices', () => {
	it('the build lowers inset for the oldest supported browsers', () => {
		const config = read('../../../vite.config.ts');

		expect(config).toMatch(/cssTarget:\s*\[[^\]]*'chrome80'[^\]]*'safari13'/);
	});

	it('the student notice has physical edges before its logical ones', () => {
		const css = read('../student-notice.scss');

		expect(css.indexOf('left: var(--space-md);')).toBeGreaterThan(-1);
		expect(css.indexOf('left: var(--space-md);')).toBeLessThan(css.indexOf('inset-inline:'));
	});

	it('the sheet height still has a vh value before its dvh one', () => {
		const css = read('../student-c3-rate.scss');

		expect(css.indexOf('height: 92vh;')).toBeGreaterThan(-1);
		expect(css.indexOf('height: 92vh;')).toBeLessThan(css.indexOf('height: 92dvh;'));
	});
});
