import React from 'react';
import { render, screen } from '@testing-library/react';
import PersonRow from '../PersonRow';

function renderInList(row: React.ReactElement) {
	return render(<ul>{row}</ul>);
}

describe('PersonRow', () => {
	it('renders a list item with the name in its own direction and the meta line', () => {
		renderInList(<PersonRow name="Dana Levi" meta="asked 2 hours ago" />);
		const item = screen.getByRole('listitem');
		const name = screen.getByText('Dana Levi', { selector: '.person-row__name' });

		expect(item).toHaveClass('person-row');
		expect(item).not.toHaveClass('person-row--with-select', 'person-row--stacked-actions');
		expect(name).toHaveAttribute('dir', 'auto');
		expect(screen.getByText('asked 2 hours ago')).toHaveClass('person-row__meta');
		expect(item.querySelector('.person-row__actions')).toBeNull();
	});

	it('adds the select, actions and note slots with their modifiers', () => {
		renderInList(
			<PersonRow
				name="Dana"
				select={<input type="checkbox" aria-label="Select Dana" />}
				actions={<button type="button">Let in</button>}
				note={<p>Could not let in</p>}
				stackActionsOnMobile
				isBusy
				testId="row"
			/>,
		);
		const item = screen.getByTestId('row');

		expect(item).toHaveClass(
			'person-row--with-select',
			'person-row--stacked-actions',
			'person-row--busy',
		);
		expect(item).toHaveAttribute('aria-busy', 'true');
		expect(item.querySelector('.person-row__select')).toContainElement(
			screen.getByRole('checkbox', { name: 'Select Dana' }),
		);
		expect(item.querySelector('.person-row__actions')).toContainElement(
			screen.getByRole('button', { name: 'Let in' }),
		);
		expect(item.querySelector('.person-row__note')).toHaveTextContent('Could not let in');
	});

	it('uses no inline left/right styles, so it mirrors under dir="rtl"', () => {
		const { container } = render(
			<div dir="rtl">
				<ul>
					<PersonRow name="דנה לוי" actions={<button type="button">לאשר</button>} />
				</ul>
			</div>,
		);

		container.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
			expect(el.getAttribute('style')).not.toMatch(/left|right/);
		});
	});
});
