import React from 'react';
import { render } from '@testing-library/react';
import { useHomeStatementOverlay } from '@/controllers/hooks/useHomeStatementOverlay';
import HomeMain from '../HomeMain';

const mockSubscriptions = [
	{
		userId: 'u',
		statementId: 'top',
		parentId: 'top',
		statement: { statement: 'Group', statementType: 'group' },
	},
	...Array.from({ length: 1000 }, (_, i) => ({
		userId: 'u',
		statementId: `child-${i}`,
		parentId: 'top-question',
		statement: { statement: 'Proposal', statementType: 'option' },
	})),
];
const mockState = {
	statements: { statements: [], statementSubscription: mockSubscriptions },
	creator: { creator: { uid: 'u' } },
};
jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/redux/statements/newStatementSlice', () => ({
	selectNewStatementShowModal: () => false,
}));
jest.mock('@/controllers/hooks/useHomeStatementOverlay', () => ({
	useHomeStatementOverlay: jest.fn(),
}));
jest.mock('../../hooks/useLazyLoadHomeSubscriptions', () => ({
	useLazyLoadHomeSubscriptions: () => ({}),
}));
jest.mock('@/view/components/atomic/organisms/ThinkingSpace/ConversationHome', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../../../statement/components/newStatement/NewStatement', () => ({
	__esModule: true,
	default: () => null,
}));
it('requests fresh home overlays only for top-level subscriptions', () => {
	render(<HomeMain />);
	expect(useHomeStatementOverlay).toHaveBeenCalledWith([mockSubscriptions[0]]);
});
