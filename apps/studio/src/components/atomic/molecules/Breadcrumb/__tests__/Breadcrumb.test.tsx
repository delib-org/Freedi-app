import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';

// A plain anchor stands in for the router link: this is about the shape of the
// trail, and apps/studio carries its own react-router copy, which would give
// the test a second React.
vi.mock('react-router-dom', () => ({
	Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

import Breadcrumb, { type BreadcrumbItem } from '../Breadcrumb';

function renderTrail(items: BreadcrumbItem[], root?: React.ReactNode) {
	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<Breadcrumb root={root} items={items} />
		</TranslationProvider>,
	);
}

const ITEMS: BreadcrumbItem[] = [
	{ label: 'Questions', to: '/orgs/o1' },
	{ label: 'How should we enforce parking?' },
];

describe('Breadcrumb', () => {
	afterEach(cleanup);

	it('puts the workspace first, before everything inside it', () => {
		renderTrail(ITEMS, <span>Metzudot</span>);

		const crumbs = screen.getAllByRole('listitem');
		expect(within(crumbs[0]).getByText('Metzudot')).toBeTruthy();
		expect(within(crumbs[1]).getByText('Questions')).toBeTruthy();
	});

	it('marks the workspace crumb so it is never hidden', () => {
		renderTrail(ITEMS, <span>Metzudot</span>);

		expect(screen.getAllByRole('listitem')[0].className).toContain('breadcrumb__item--root');
	});

	it('marks the last crumb as the current page', () => {
		renderTrail(ITEMS, <span>Metzudot</span>);

		const current = screen.getByText('How should we enforce parking?');
		expect(current.getAttribute('aria-current')).toBe('page');
		expect(current.closest('li')?.className).toContain('breadcrumb__item--current');
	});

	it('marks the crumb before it as the parent, which a phone keeps', () => {
		renderTrail(ITEMS, <span>Metzudot</span>);

		expect(screen.getByText('Questions').closest('li')?.className).toContain(
			'breadcrumb__item--parent',
		);
	});

	it('leads each item with its separator, so hiding one leaves none dangling', () => {
		const { container } = renderTrail(ITEMS, <span>Metzudot</span>);

		const items = container.querySelectorAll('.breadcrumb__item');
		// The workspace has no separator before it; every later crumb does.
		expect(items[0].querySelector('.breadcrumb__separator')).toBeNull();
		expect(items[1].querySelector('.breadcrumb__separator')).toBeTruthy();
		expect(items[2].querySelector('.breadcrumb__separator')).toBeTruthy();
	});

	it('renders items with a link as links, and the current page as text', () => {
		renderTrail(ITEMS, <span>Metzudot</span>);

		expect(screen.getByRole('link', { name: 'Questions' }).getAttribute('href')).toBe('/orgs/o1');
		expect(screen.queryByRole('link', { name: /enforce parking/ })).toBeNull();
	});

	it('omits the leading separator when there is no workspace crumb', () => {
		const { container } = renderTrail(ITEMS);

		expect(
			container.querySelectorAll('.breadcrumb__item')[0].querySelector('.breadcrumb__separator'),
		).toBeNull();
	});

	it('lets a mixed-script label pick its own direction', () => {
		renderTrail([{ label: 'מה מפריע לך?' }], <span>Metzudot</span>);

		expect(screen.getByText('מה מפריע לך?').getAttribute('dir')).toBe('auto');
	});
});
