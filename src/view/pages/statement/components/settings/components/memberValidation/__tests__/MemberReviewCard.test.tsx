import { fireEvent, render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import type { MemberReviewData } from '@/types/demographics';
import MemberReviewCard from '../memberReviewCard/MemberReviewCard';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/helpers/roleHelpers', () => ({ getBanDisabledReason: () => '' }));

const member = {
	userId: 'maya',
	user: { uid: 'maya', displayName: 'Maya' },
	responses: [{ questionId: 'q', question: 'Age?', answer: '30' }],
	flags: [],
	status: 'pending',
} as unknown as MemberReviewData;

function renderCard() {
	render(
		<MemberReviewCard
			member={member}
			statement={{ statementId: 's1', creator: { uid: 'host' } } as Statement}
			isSelected={false}
			onSelect={jest.fn()}
			onApprove={jest.fn()}
			onFlag={jest.fn()}
			onBan={jest.fn()}
			canBan
		/>,
	);
}

describe('MemberReviewCard (Entry check row)', () => {
	it('names its select checkbox after the person', () => {
		renderCard();

		expect(screen.getByRole('checkbox', { name: 'people.selectPerson' })).toBeTruthy();
	});

	it('has a named expander that reports and controls its answers', () => {
		renderCard();
		const expander = screen.getByRole('button', { name: 'people.entry.answersOf' });

		expect(expander).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Age?')).toBeNull();

		fireEvent.click(expander);

		expect(expander).toHaveAttribute('aria-expanded', 'true');
		const controlled = document.getElementById(expander.getAttribute('aria-controls') ?? '');
		expect(controlled).toHaveTextContent('Age?');
	});
});
