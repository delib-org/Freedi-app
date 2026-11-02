import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SettingsSection from '../components/settingsSection/SettingsSection';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ dir: 'ltr', t: (key: string) => key }),
}));

describe('SettingsSection', () => {
	it('shows its content when expanded by default and hides it when the header is clicked', () => {
		render(
			<SettingsSection title="Basics">
				<p>Section content</p>
			</SettingsSection>,
		);
		const header = screen.getByRole('button', { name: /Basics/ });

		expect(screen.getByText('Section content')).toBeTruthy();
		expect(header).toHaveAttribute('aria-expanded', 'true');

		fireEvent.click(header);
		expect(header).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Section content')).toBeNull();
	});

	it('starts closed with defaultExpanded=false and opens on Enter', () => {
		render(
			<SettingsSection title="Basics" defaultExpanded={false}>
				<p>Section content</p>
			</SettingsSection>,
		);
		const header = screen.getByRole('button', { name: /Basics/ });

		expect(screen.queryByText('Section content')).toBeNull();
		fireEvent.keyDown(header, { key: 'Enter' });
		expect(screen.getByText('Section content')).toBeTruthy();
	});
});
