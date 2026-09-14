import { fireEvent, render, screen } from '@testing-library/react';
import HostHub from '../HostHub';

const navigate = jest.fn();
const hostHubOpened = jest.fn();
let search = '';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('react-router', () => ({
	...jest.requireActual('react-router'),
	useNavigate: () => navigate,
}));
jest.mock('../../../hooks/useStatementView', () => ({
	useStatementView: () => ({ statementId: 'q1', rest: new URLSearchParams(search) }),
}));
jest.mock('../../settings/useStatementSettingsData', () => ({
	useStatementSettingsData: () => ({
		statementToEdit: { statementId: 'q1', statement: 'Q', statementType: 'question' },
		setStatementToEdit: jest.fn(),
		parentStatement: 'top',
	}),
}));
jest.mock('@/services/analytics', () => ({
	uxAnalytics: { hostHubOpened: (...args: unknown[]) => hostHubOpened(...args) },
}));
jest.mock('../LiveNowCard', () => ({
	__esModule: true,
	default: () => <div data-testid="live-body" />,
}));
jest.mock('../PeopleSection', () => ({
	__esModule: true,
	default: () => <div data-testid="people-body" />,
}));
jest.mock('../AnswersSection', () => ({
	__esModule: true,
	default: () => <div data-testid="answers-body" />,
}));
jest.mock('../ResultsSection', () => ({
	__esModule: true,
	default: () => <div data-testid="results-body" />,
}));
jest.mock('../HubSettingsSection', () => ({
	__esModule: true,
	default: () => <div data-testid="settings-body" />,
}));
jest.mock('../InsightsSection', () => ({
	__esModule: true,
	default: () => <div data-testid="insights-body" />,
}));

describe('HostHub', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		search = '';
		Element.prototype.scrollIntoView = jest.fn();
	});

	it('renders the six cards with only Live now open by default', () => {
		render(<HostHub />);
		['live', 'people', 'answers', 'results', 'settings', 'insights'].forEach((id) =>
			expect(screen.getByTestId(`host-hub-section-${id}`)).toBeInTheDocument(),
		);
		expect(screen.getByTestId('live-body')).toBeInTheDocument();
		expect(screen.queryByTestId('people-body')).not.toBeInTheDocument();
		expect(hostHubOpened).toHaveBeenCalledWith('q1', 'live');
	});

	it('?section= deep-links into a card and reports it', () => {
		search = 'section=results';
		render(<HostHub />);
		expect(screen.getByTestId('results-body')).toBeInTheDocument();
		expect(screen.queryByTestId('live-body')).not.toBeInTheDocument();
		expect(hostHubOpened).toHaveBeenCalledWith('q1', 'results');
		expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it('toggling a card opens it, reports it and rewrites the URL in place', () => {
		render(<HostHub />);
		fireEvent.click(screen.getByRole('button', { name: /host.people/ }));
		expect(screen.getByTestId('people-body')).toBeInTheDocument();
		expect(hostHubOpened).toHaveBeenLastCalledWith('q1', 'people');
		expect(navigate).toHaveBeenCalledWith('/statement-screen/q1/settings?section=people', {
			replace: true,
		});

		fireEvent.click(screen.getByRole('button', { name: /host.people/ }));
		expect(screen.queryByTestId('people-body')).not.toBeInTheDocument();
		expect(navigate).toHaveBeenCalledTimes(1);
	});
});
