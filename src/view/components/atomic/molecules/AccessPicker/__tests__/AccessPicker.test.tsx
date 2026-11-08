import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AccessPicker from '../AccessPicker';

type Level = 'open' | 'approval';
const options = [
	{ value: 'open' as Level, label: 'Open to all', hint: 'Anyone with the link joins' },
	{ value: 'approval' as Level, label: 'By approval', hint: 'You let each person in' },
];

describe('AccessPicker', () => {
	it('is a fieldset with a legend and one radio per level, hint described', () => {
		const { container } = render(
			<AccessPicker legend="Who can join" options={options} value="open" onChange={jest.fn()} />,
		);

		expect(container.firstChild).toHaveClass('access-picker');
		expect(screen.getByRole('group', { name: 'Who can join' }).tagName).toBe('FIELDSET');
		const open = screen.getByRole('radio', { name: 'Open to all' });
		expect(open).toBeChecked();
		expect(open).toHaveAccessibleDescription('Anyone with the link joins');
		expect(open.closest('label')).toHaveClass('access-picker__option--checked');
		expect(screen.getByRole('radio', { name: 'By approval' })).not.toBeChecked();
	});

	it('reports the chosen level', () => {
		const onChange = jest.fn();
		render(<AccessPicker legend="L" options={options} value="open" onChange={onChange} />);

		fireEvent.click(screen.getByRole('radio', { name: 'By approval' }));
		expect(onChange).toHaveBeenCalledWith('approval');
	});

	it('disables every radio while inherited', () => {
		const { container } = render(
			<AccessPicker legend="L" options={options} value="open" onChange={jest.fn()} isInherited />,
		);

		expect(container.firstChild).toHaveClass('access-picker--inherited');
		screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
	});

	it('shows the saving row busy', () => {
		const { container } = render(
			<AccessPicker
				legend="L"
				options={options}
				value="approval"
				onChange={jest.fn()}
				savingValue="approval"
			/>,
		);

		expect(container.firstChild).toHaveClass('access-picker--saving');
		expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByRole('radio', { name: 'By approval' }).closest('label')).toHaveClass(
			'access-picker__option--busy',
		);
	});

	it('renders under dir="rtl" with no inline styles', () => {
		const { container } = render(
			<div dir="rtl">
				<AccessPicker legend="מי" options={options} value="open" onChange={jest.fn()} />
			</div>,
		);

		expect(container.querySelector('[style]')).toBeNull();
	});
});
