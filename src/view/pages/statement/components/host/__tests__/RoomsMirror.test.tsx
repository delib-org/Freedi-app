import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useActiveRoomCount } from '../../settings/components/optionRooms/useActiveRoomCount';
import RoomsMirror from '../RoomsMirror';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('../../settings/components/optionRooms/useActiveRoomCount', () => ({
	useActiveRoomCount: jest.fn(),
}));

const mockedCount = useActiveRoomCount as jest.MockedFunction<typeof useActiveRoomCount>;

function question(joiningEnabled: boolean): Statement {
	return { statementId: 'q1', statementSettings: { joiningEnabled } } as Statement;
}

function renderMirror(statement: Statement) {
	return render(
		<MemoryRouter>
			<RoomsMirror statement={statement} />
		</MemoryRouter>,
	);
}

describe('RoomsMirror (Answers)', () => {
	it('is one read-only link to People #joining once rooms exist', () => {
		mockedCount.mockReturnValue(4);
		renderMirror(question(true));
		const link = screen.getByTestId('answers-rooms-mirror');

		expect(link).toHaveTextContent('people.rooms.mirror');
		expect(link.getAttribute('href')).toBe('/statement-screen/q1/settings?section=people#joining');
		expect(mockedCount).toHaveBeenCalledWith('q1', true);
	});

	it('renders nothing while there are no rooms', () => {
		mockedCount.mockReturnValue(0);
		renderMirror(question(true));

		expect(screen.queryByTestId('answers-rooms-mirror')).toBeNull();
	});

	it('does not listen for rooms when joining is off', () => {
		mockedCount.mockReturnValue(0);
		renderMirror(question(false));

		expect(mockedCount).toHaveBeenCalledWith('q1', false);
	});
});
