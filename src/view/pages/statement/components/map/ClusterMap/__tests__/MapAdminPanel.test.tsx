import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Statement } from '@freedi/shared-types';
import MapAdminPanel from '../MapAdminPanel';

jest.mock('firebase/firestore', () => ({ setDoc: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({ createStatementRef: jest.fn() }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@/controllers/db/synthesis/synthesisOperations', () => ({
	previewThemeRebuild: jest.fn(),
	applyThemeRebuild: jest.fn(),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (text: string) => text, dir: 'ltr' }),
}));

const statement = { statementId: 'q-1', statement: 'Question' } as unknown as Statement;

function renderPanel(canConfigure: boolean): void {
	render(
		<MapAdminPanel
			statement={statement}
			settings={{}}
			canConfigure={canConfigure}
			localFilter={null}
			onLocalFilterChange={jest.fn()}
			applyToEveryone
			onApplyToEveryoneChange={jest.fn()}
		/>,
	);
	// The drawer is aria-hidden until the gear handle opens it.
	fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
}

describe('MapAdminPanel — Re-theme with AI section', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		document.body.innerHTML = '';
		localStorage.clear();
	});

	it('shows the section with the button and its explanation to an admin', () => {
		renderPanel(true);

		const section = screen.getByTestId('map-theme-rebuild');
		expect(section).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Re-theme with AI' })).toBeInTheDocument();
		expect(
			screen.getByText(
				"Let AI regroup all ideas into themes. You'll see a preview before anything changes.",
			),
		).toBeInTheDocument();
	});

	it('hides the section from a viewer who may only filter', () => {
		renderPanel(false);

		expect(screen.queryByTestId('map-theme-rebuild')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Re-theme with AI' })).toBeNull();
		// The filter section is still there for the permitted viewer.
		expect(screen.getByText('Filter responses')).toBeInTheDocument();
	});
});
