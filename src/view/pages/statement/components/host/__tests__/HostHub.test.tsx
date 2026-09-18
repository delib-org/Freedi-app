import { fireEvent, render, screen } from '@testing-library/react';
import HostHub from '../HostHub';

const navigate = jest.fn();
const hostHubOpened = jest.fn();
let search = '';
let statementType = 'question';

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
		statementToEdit: { statementId: 'q1', statement: 'Q', statementType },
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
jest.mock('../AISection', () => ({
	__esModule: true,
	default: () => <div data-testid="ai-body" />,
}));
jest.mock('../ClusteringSection', () => ({
	__esModule: true,
	default: () => <div data-testid="clustering-body" />,
}));

describe('HostHub', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		search = '';
		statementType = 'question';
		Element.prototype.scrollIntoView = jest.fn();
	});

	it('renders every card with only Live now open by default', () => {
		render(<HostHub />);
		['live', 'people', 'answers', 'results', 'ai', 'clustering', 'settings', 'insights'].forEach(
			(id) => expect(screen.getByTestId(`host-hub-section-${id}`)).toBeInTheDocument(),
		);
		expect(screen.getByTestId('live-body')).toBeInTheDocument();
		expect(screen.queryByTestId('people-body')).not.toBeInTheDocument();
		expect(hostHubOpened).toHaveBeenCalledWith('q1', 'live');
	});

	it('shows the Clustering card only on questions', () => {
		statementType = 'group';
		render(<HostHub />);
		expect(screen.getByTestId('host-hub-section-ai')).toBeInTheDocument();
		expect(screen.queryByTestId('host-hub-section-clustering')).not.toBeInTheDocument();
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
