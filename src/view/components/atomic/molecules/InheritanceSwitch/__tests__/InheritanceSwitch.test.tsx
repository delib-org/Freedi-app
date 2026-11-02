import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import InheritanceSwitch from '../InheritanceSwitch';

const labels = {
	inheritLabel: 'Same as the group',
	overrideLabel: 'Change for this question',
	groupLabel: 'Who can join',
};

describe('InheritanceSwitch', () => {
	it('marks the inherited side pressed and the block inherited', () => {
		const { container } = render(
			<InheritanceSwitch {...labels} isInherited onChange={jest.fn()} caption="Group is: Open">
				<span>control</span>
			</InheritanceSwitch>,
		);

		expect(container.firstChild).toHaveClass('inheritance-switch', 'inheritance-switch--inherited');
		expect(screen.getByRole('group', { name: 'Who can join' })).toHaveClass(
			'segmented-control',
			'segmented-control--stretch',
		);
		const same = screen.getByRole('button', { name: 'Same as the group' });
		expect(same).toHaveAttribute('aria-pressed', 'true');
		expect(same).toHaveClass('segmented-control__segment--active');
		expect(screen.getByRole('button', { name: 'Change for this question' })).toHaveAttribute(
			'aria-pressed',
			'false',
		);
		expect(screen.getByText('Group is: Open')).toHaveClass('inheritance-switch__caption');
		expect(screen.getByText('control').parentElement).toHaveClass('inheritance-switch__body');
	});

	it('reports the other side and ignores a tap on the active one', () => {
		const onChange = jest.fn();
		render(<InheritanceSwitch {...labels} isInherited onChange={onChange} />);

		fireEvent.click(screen.getByRole('button', { name: 'Same as the group' }));
		expect(onChange).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Change for this question' }));
		expect(onChange).toHaveBeenCalledWith(false);
	});

	it('reports inherit from the override side', () => {
		const onChange = jest.fn();
		const { container } = render(
			<InheritanceSwitch {...labels} isInherited={false} onChange={onChange} />,
		);

		expect(container.firstChild).not.toHaveClass('inheritance-switch--inherited');
		fireEvent.click(screen.getByRole('button', { name: 'Same as the group' }));
		expect(onChange).toHaveBeenCalledWith(true);
	});

	it('marks the choice busy while saving', () => {
		const { container } = render(
			<InheritanceSwitch {...labels} isInherited onChange={jest.fn()} isSaving />,
		);

		expect(container.firstChild).toHaveClass('inheritance-switch--saving');
		expect(screen.getByRole('group')).toHaveAttribute('aria-busy', 'true');
	});

	it('renders under dir="rtl" with no physical inline styles', () => {
		const { container } = render(
			<div dir="rtl">
				<InheritanceSwitch {...labels} isInherited onChange={jest.fn()} caption="בקבוצה" />
			</div>,
		);

		expect(container.querySelector('[style]')).toBeNull();
		expect(screen.getAllByRole('button')).toHaveLength(2);
	});
});
