import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { Statement } from '@freedi/shared-types';
import AddAnswerFab from '../AddAnswerFab';

let mockAddedId: string | undefined;

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useAnswerCompose', () => ({
	useAnswerCompose: () => ({ register: () => () => undefined }),
}));
jest.mock('../AddAnswerSheet', () => ({
	__esModule: true,
	default: function MockSheet({
		onClose,
		onAnswerAdded,
	}: {
		onClose: () => void;
		onAnswerAdded: (id: string) => void;
	}) {
		const { useEffect: runOnMount } = jest.requireActual<typeof import('react')>('react');
		runOnMount(() => {
			if (mockAddedId) onAnswerAdded(mockAddedId);
			onClose();
		}, []);

		return null;
	},
}));

const statement = { statementId: 'q1' } as unknown as Statement;
const seenSearch: string[] = [];

function LocationProbe() {
	const { search } = useLocation();
	useEffect(() => {
		seenSearch.push(search);
	}, [search]);

	return null;
}

function openAndFinish() {
	render(
		<MemoryRouter initialEntries={['/statement/q1?tab=options']}>
			<AddAnswerFab statement={statement} />
			<LocationProbe />
		</MemoryRouter>,
	);
	fireEvent.click(screen.getByTestId('add-answer-fab'));
}

describe('AddAnswerFab', () => {
	beforeEach(() => {
		seenSearch.length = 0;
	});

	it('confirms a published answer and focuses it, once the sheet has closed', () => {
		mockAddedId = 'a1';
		openAndFinish();

		expect(screen.getByTestId('action-toast')).toHaveTextContent('question.answerAdded');
		expect(seenSearch.at(-1)).toBe('?tab=options&focusId=a1');
	});

	it('says nothing when no answer was added', () => {
		mockAddedId = undefined;
		openAndFinish();

		expect(screen.queryByTestId('action-toast')).not.toBeInTheDocument();
		expect(seenSearch.at(-1)).toBe('?tab=options');
	});
});
