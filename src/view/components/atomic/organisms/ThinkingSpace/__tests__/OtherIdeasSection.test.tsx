import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import OtherIdeasSection, { OTHER_IDEAS_PREVIEW_COUNT } from '../OtherIdeasSection';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const atoms = (n: number): Statement[] =>
	Array.from(
		{ length: n },
		(_, i) => ({ statementId: `a${i}`, statement: `idea ${i}` }) as Statement,
	);
const renderAtom = (atom: Statement): React.ReactNode => (
	<p key={atom.statementId}>{atom.statement}</p>
);

describe('OtherIdeasSection', () => {
	it('renders nothing without ideas', () => {
		const { container } = render(<OtherIdeasSection atoms={[]} renderAtom={renderAtom} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('shows the heading, the one explainer line and every idea when few', () => {
		render(<OtherIdeasSection atoms={atoms(2)} renderAtom={renderAtom} />);

		expect(screen.getByRole('heading', { name: /Other ideas/ })).toBeInTheDocument();
		expect(screen.getByText('Ideas that stand on their own.')).toBeInTheDocument();
		expect(screen.getAllByText(/^idea /)).toHaveLength(2);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('cuts a long group at the preview count and reveals the rest on request', () => {
		render(
			<OtherIdeasSection atoms={atoms(OTHER_IDEAS_PREVIEW_COUNT + 3)} renderAtom={renderAtom} />,
		);

		expect(screen.getAllByText(/^idea /)).toHaveLength(OTHER_IDEAS_PREVIEW_COUNT);
		fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
		expect(screen.getAllByText(/^idea /)).toHaveLength(OTHER_IDEAS_PREVIEW_COUNT + 3);
	});
});
