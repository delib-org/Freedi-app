import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDoc } from 'firebase/firestore';
import { Access, Role, Statement } from '@freedi/shared-types';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { forgetLevelReads } from '@/controllers/db/statements/levelAccess';
import Back from '../Back';

const mockNavigate = jest.fn();
const mockCreator = { uid: 'u1', isAnonymous: false };
const mockReduxState = {
	statements: {
		statements: [
			{ statementId: 'mid', topParentId: 'group' },
			{ statementId: 'group', topParentId: 'group', membership: { access: Access.secret } },
		],
		statementSubscription: [{ statementId: 'group', role: Role.member }],
	},
};

jest.mock('firebase/firestore', () => ({
	...jest.requireActual('firebase/firestore'),
	getDoc: jest.fn(),
}));
jest.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
jest.mock('@/redux/store', () => ({ store: { getState: () => mockReduxState } }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => mockCreator }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({ getStatementFromDB: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({ createSubscriptionRef: (id: string) => ({ id }) }));
jest.mock('@/controllers/general/helpers', () => ({
	getStatementSubscriptionId: (statementId: string, uid: string) => `${uid}--${statementId}`,
}));
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const question = {
	statementId: 'q1',
	parents: ['top', 'group', 'mid'],
	parentId: 'mid',
	topParentId: 'group',
	membership: { access: Access.public },
} as Statement;

it('navigates to a parent Redux knows is open, with no read at all', async () => {
	forgetLevelReads();
	window.history.pushState({}, '', '/statement/q1');
	render(<Back statement={question} />);
	fireEvent.click(screen.getByRole('button', { name: 'Back' }));

	await waitFor(() =>
		expect(mockNavigate).toHaveBeenCalledWith('/statement/mid', expect.anything()),
	);
	expect(getStatementFromDB).not.toHaveBeenCalled();
	expect(getDoc).not.toHaveBeenCalled();
});
