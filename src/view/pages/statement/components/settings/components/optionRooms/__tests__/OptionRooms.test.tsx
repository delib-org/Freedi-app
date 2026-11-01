import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoomSettings, Statement } from '@freedi/shared-types';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import {
	clearAllRoomsForParent,
	getAllOptionsWithMembers,
	splitJoinedOption,
} from '@/controllers/db/joining/splitJoinedOption';
import OptionRooms from '../OptionRooms';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('@/controllers/db/statementSettings/setStatementSettings', () => ({
	setStatementSettingToDB: jest.fn(),
}));
jest.mock('@/controllers/db/joining/splitJoinedOption', () => ({
	getAllOptionsWithMembers: jest.fn(),
	splitJoinedOption: jest.fn(),
	clearAllRoomsForParent: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

let roomSettings: RoomSettings[] = [];
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: (state: unknown) => unknown) =>
		selector({ roomAssignment: { settings: roomSettings } }),
}));

function stub(testId: string) {
	return { __esModule: true, default: () => <div data-testid={testId} /> };
}
jest.mock('../../advancedSettings/JoinFormCard', () => stub('join-form'));
jest.mock('../../advancedSettings/SubQuestionJoinFormsCard/SubQuestionJoinFormsCard', () =>
	stub('sub-join-forms'),
);
jest.mock('../../QuestionSettings/JoinResolutionSettings/JoinResolutionSettings', () =>
	stub('conditional-joining'),
);
jest.mock('../RoomDiversitySettings', () => stub('diversity'));
jest.mock('../CreatedRoomsDisplay', () => stub('rooms-created'));

const mockedSave = setStatementSettingToDB as jest.Mock;
const mockedOptions = getAllOptionsWithMembers as jest.Mock;
const mockedSplit = splitJoinedOption as jest.Mock;
const mockedClear = clearAllRoomsForParent as jest.Mock;

function question(statementSettings: Statement['statementSettings'] = {}): Statement {
	return { statementId: 'q1', topParentId: 'g1', statementSettings } as Statement;
}

const answer = (id: string, joinedCount: number) => ({
	statementId: id,
	statement: `Answer ${id}`,
	joinedCount,
	maxMembers: 7,
	minMembers: 3,
	hasActiveRooms: false,
});

describe('OptionRooms (Joining answers & rooms)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		roomSettings = [];
		mockedOptions.mockResolvedValue({ options: [answer('a', 4)] });
		mockedClear.mockResolvedValue(undefined);
		mockedSplit.mockResolvedValue({ totalRooms: 1, totalParticipants: 4 });
	});

	it('off: only the Joining answers switch renders', () => {
		render(<OptionRooms statement={question()} />);

		expect(screen.getByText('people.joining')).toBeTruthy();
		expect(screen.queryByTestId('join-form')).toBeNull();
		expect(screen.queryByText('people.joining.each')).toBeNull();
		expect(screen.queryByText('host.joiningOffHint')).toBeNull();
	});

	it('the switch still writes statementSettings.joiningEnabled', () => {
		render(<OptionRooms statement={question()} />);
		fireEvent.click(screen.getByRole('checkbox', { name: 'people.joining' }));

		expect(mockedSave).toHaveBeenCalledWith(
			expect.objectContaining({
				property: 'joiningEnabled',
				newValue: true,
				settingsSection: 'statementSettings',
			}),
		);
	});

	it('on: one/many, join form, conditional joining, threshold and rooms in one block', async () => {
		await act(async () => {
			render(<OptionRooms statement={question({ joiningEnabled: true })} />);
		});

		expect(screen.getByRole('tablist', { name: 'people.joining.each' })).toBeTruthy();
		['join-form', 'sub-join-forms', 'conditional-joining', 'diversity', 'rooms-created'].forEach(
			(id) => expect(screen.getByTestId(id)).toBeTruthy(),
		);
		expect(screen.getByText('people.activationThreshold')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'people.rooms.split' })).toBeTruthy();
	});

	it('One / Many still writes singleJoinOnly', async () => {
		await act(async () => {
			render(<OptionRooms statement={question({ joiningEnabled: true })} />);
		});
		fireEvent.click(screen.getByRole('tab', { name: /people\.joining\.one/ }));

		expect(mockedSave).toHaveBeenCalledWith(
			expect.objectContaining({ property: 'singleJoinOnly', newValue: true }),
		);
	});

	it('the activation threshold still writes statementSettings.activationThreshold', async () => {
		await act(async () => {
			render(<OptionRooms statement={question({ joiningEnabled: true })} />);
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'people.activationThreshold' }));

		expect(mockedSave).toHaveBeenCalledWith(
			expect.objectContaining({
				property: 'activationThreshold',
				newValue: { enabled: true },
			}),
		);
	});

	it('Split is disabled until two people joined one answer', async () => {
		mockedOptions.mockResolvedValue({ options: [answer('a', 1)] });
		await act(async () => {
			render(<OptionRooms statement={question({ joiningEnabled: true })} />);
		});

		expect(screen.getByRole('button', { name: 'people.rooms.split' })).toBeDisabled();
		expect(screen.getByText('people.rooms.needTwo')).toBeTruthy();
	});

	it('a failed split says so inline', async () => {
		mockedSplit.mockRejectedValue(new Error('boom'));
		await act(async () => {
			render(<OptionRooms statement={question({ joiningEnabled: true })} />);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'people.rooms.split' }));
		});

		expect(screen.getByText('people.rooms.splitFailed')).toBeTruthy();
	});

	it('re-splitting asks before replacing the existing rooms', async () => {
		roomSettings = [
			{
				settingsId: 's',
				statementId: 'a',
				topParentId: 'q1',
				status: 'active',
				totalRooms: 2,
				createdAt: 1,
			} as RoomSettings,
		];
		await act(async () => {
			render(<OptionRooms statement={question({ joiningEnabled: true })} />);
		});
		fireEvent.click(screen.getByRole('button', { name: 'people.rooms.split' }));

		expect(screen.getByText('people.rooms.replace.title')).toBeTruthy();
		expect(mockedClear).not.toHaveBeenCalled();
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
		});
		await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(1));
		expect(mockedClear).toHaveBeenCalledWith('q1');
	});
});
