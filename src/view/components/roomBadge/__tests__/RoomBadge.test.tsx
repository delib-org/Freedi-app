import { render, screen } from '@testing-library/react';
import { RoomParticipant } from '@freedi/shared-types';
import { useSelector } from 'react-redux';
import { listenToUserRoomAssignment } from '@/controllers/db/roomAssignment/getRoomAssignment';
import RoomBadge, { RoomAssignmentsContext } from '../RoomBadge';

jest.mock('react-redux', () => ({ useSelector: jest.fn() }));
jest.mock('@/controllers/db/roomAssignment/getRoomAssignment', () => ({
	listenToUserRoomAssignment: jest.fn(() => jest.fn()),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const assigned = new Map([['a', { statementId: 'a', roomNumber: 4 } as RoomParticipant]]);

describe('RoomBadge', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(useSelector as unknown as jest.Mock).mockReturnValue({ uid: 'me' });
	});

	it('reads the list’s one listener and opens none of its own', () => {
		render(
			<RoomAssignmentsContext.Provider value={assigned}>
				<RoomBadge statementId="a" />
				<RoomBadge statementId="b" />
			</RoomAssignmentsContext.Provider>,
		);

		expect(screen.getByText('Room #4')).toBeInTheDocument();
		expect(screen.getAllByText(/Room #/)).toHaveLength(1);
		expect(listenToUserRoomAssignment).not.toHaveBeenCalled();
	});

	it('listens for itself outside a list', () => {
		render(<RoomBadge statementId="a" />);

		expect(listenToUserRoomAssignment).toHaveBeenCalledTimes(1);
	});
});
