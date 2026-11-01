import { fireEvent, render, screen, within } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import type { MemberReviewData } from '@/types/demographics';
import type { EntryCheckState } from '@/view/pages/statement/components/host/people/useEntryCheck';
import { countEntryStatuses } from '@/view/pages/statement/components/host/people/useEntryCheck';
import MemberValidation from '../MemberValidation';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('../memberReviewList/MemberReviewList', () => ({
	__esModule: true,
	default: ({ members }: { members: MemberReviewData[] }) => (
		<ul data-testid="review-list">
			{members.map((m) => (
				<li key={m.userId}>{m.userId}</li>
			))}
		</ul>
	),
}));

function review(userId: string, status: MemberReviewData['status']): MemberReviewData {
	return {
		userId,
		user: { uid: userId, displayName: userId },
		responses: [],
		flags: [],
		status,
	} as unknown as MemberReviewData;
}

function entryCheckOf(members: MemberReviewData[]): EntryCheckState {
	return {
		members,
		counts: countEntryStatuses(members),
		isLoading: false,
		reload: jest.fn(),
		decide: jest.fn(),
	};
}

const statement = { statementId: 's1' } as Statement;

describe('MemberValidation (Entry check)', () => {
	it('shows the counts per status and one Review answers button', () => {
		render(
			<MemberValidation
				statement={statement}
				entryCheck={entryCheckOf([
					review('a', 'pending'),
					review('b', 'pending'),
					review('c', 'flagged'),
				])}
			/>,
		);

		expect(screen.getByText('people.entry.waitingReview').textContent).toContain('2');
		expect(screen.getByText('people.entry.flagged').textContent).toContain('1');
		expect(screen.getByRole('button', { name: 'people.reviewAnswers' })).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('Review answers opens the Modal on Waiting review; tabs switch the list', () => {
		render(
			<MemberValidation
				statement={statement}
				entryCheck={entryCheckOf([review('a', 'pending'), review('c', 'approved')])}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'people.reviewAnswers' }));
		const dialog = screen.getByRole('dialog', { name: 'people.entryCheck' });

		expect(dialog).toHaveAttribute('aria-labelledby');
		expect(dialog).not.toHaveAttribute('aria-label');
		expect(within(screen.getByTestId('review-list')).getAllByRole('listitem')).toHaveLength(1);
		fireEvent.click(within(dialog).getByRole('tab', { name: /people\.filter\.all/ }));
		expect(within(screen.getByTestId('review-list')).getAllByRole('listitem')).toHaveLength(2);
	});

	it('says "No answers yet" when nobody answered', () => {
		render(<MemberValidation statement={statement} entryCheck={entryCheckOf([])} />);
		fireEvent.click(screen.getByRole('button', { name: 'people.reviewAnswers' }));

		expect(screen.getByText('people.entry.empty')).toBeTruthy();
	});
});
