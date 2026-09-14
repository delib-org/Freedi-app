import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatementType, type SearchMatch } from '@freedi/shared-types';
import SearchResults from '../SearchResults';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en', dir: 'ltr' }),
}));

function match(id: string, title: string, extra: Partial<SearchMatch> = {}): SearchMatch {
	return {
		candidate: {
			statementId: id,
			title,
			statementType: StatementType.option,
			parentId: 'q1',
			topParentId: 't1',
			lastUpdate: 1,
		},
		score: 0.9,
		kind: 'lexical',
		field: 'title',
		ranges: [{ start: 0, end: 4 }],
		...extra,
	};
}

const baseProps = {
	query: 'talk',
	lexical: [] as SearchMatch[],
	semantic: [] as SearchMatch[],
	isLoading: false,
	onSelect: jest.fn(),
};

describe('SearchResults', () => {
	beforeEach(() => baseProps.onSelect.mockReset());

	it('groups close matches before similar meaning and highlights matches', () => {
		const { container } = render(
			<SearchResults
				{...baseProps}
				lexical={[match('o1', 'Talk about parks')]}
				semantic={[
					match('o2', 'Green spaces', { kind: 'semantic', field: undefined, ranges: undefined }),
				]}
			/>,
		);

		const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
		expect(headings).toEqual(['Close matches', 'Similar meaning']);
		expect(container.querySelector('mark')?.textContent).toBe('Talk');
		expect(screen.getAllByText('Option')).toHaveLength(2);
	});

	it('opens the chosen statement', () => {
		render(<SearchResults {...baseProps} lexical={[match('o1', 'Talk about parks')]} />);
		fireEvent.click(screen.getByRole('button', { name: /Talk about parks/ }));
		expect(baseProps.onSelect).toHaveBeenCalledWith('o1');
	});

	it('shows the description when that is what matched, and where the hit lives', () => {
		render(
			<SearchResults
				{...baseProps}
				lexical={[
					match('o1', 'Parks', {
						field: 'description',
						candidate: { ...match('o1', 'Parks').candidate, description: 'Talk to the city' },
					}),
				]}
				getContextLabel={() => 'City budget'}
			/>,
		);

		expect(screen.getByText('Talk')).toBeTruthy();
		expect(screen.getByText('City budget')).toBeTruthy();
	});

	it('says when nothing matched, but not while still searching', () => {
		const { rerender } = render(<SearchResults {...baseProps} isLoading />);
		expect(screen.queryByText(/No matches for/)).toBeNull();
		expect(screen.getByText('Searching…')).toBeTruthy();

		rerender(<SearchResults {...baseProps} />);
		expect(screen.getByText('No matches for “talk”')).toBeTruthy();
	});

	it('reports partial coverage, semantic progress, and errors', () => {
		render(
			<SearchResults
				{...baseProps}
				lexical={[match('o1', 'Talk')]}
				coverage={{ scanned: 1500, total: 5200 }}
				isSearchingMeaning
				hasError
			/>,
		);

		expect(screen.getByText('Searched 1,500 of 5,200')).toBeTruthy();
		expect(screen.getByText('Looking for similar ideas…')).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toBe('Search is not available right now');
	});
});
