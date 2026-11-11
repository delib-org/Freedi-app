import { render, screen } from '@testing-library/react';
import { CreditAction, EngagementLevel, SourceApp } from '@freedi/shared-types';
import type { Badge, CreditTransaction } from '@freedi/shared-types';
import EngagementDashboard from '../EngagementDashboard';

const hebrew: Record<string, string> = {
	'engagement.levelNumber': 'רמה {{level}}',
	'engagement.creditsEarned': '+{{amount}} נקודות',
	'engagement.action.addAnswer': 'הוספת תשובה',
	'engagement.action.other': 'השתתפת',
	'engagement.badge.firstEvaluation.name': 'קול ראשון',
	'engagement.badge.firstEvaluation.description': 'דירגת את התשובה הראשונה שלך',
};

let mockRecentCredits: CreditTransaction[] = [];
let mockBadges: Badge[] = [];

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({
		t: (key: string) => hebrew[key] ?? key,
		dir: 'rtl',
		currentLanguage: 'he',
	}),
}));
jest.mock('@/controllers/hooks/useEngagement', () => ({
	useEngagement: () => ({
		engagement: { totalEvaluations: 0, totalOptions: 0 },
		loading: false,
		recentCredits: mockRecentCredits,
		level: EngagementLevel.ADVOCATE,
		levelProgress: 0,
		nextLevelThreshold: 0,
		totalCredits: 0,
		badges: mockBadges,
	}),
}));
jest.mock('@/view/pages/statement/components/header/Back', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/loaders/PeopleLoader', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/atomic/atoms/LevelProgress/LevelProgress', () => ({
	__esModule: true,
	default: () => null,
}));

function credit(serial: number, action: CreditAction): CreditTransaction {
	return {
		transactionId: `tx-${serial}`,
		userId: 'u1',
		action,
		amount: 10,
		sourceApp: SourceApp.MAIN,
		createdAt: Date.now() - serial,
	};
}

const firstVoice: Badge = {
	badgeId: 'first_evaluation',
	name: 'First Voice',
	description: 'stored english',
	icon: 'star',
	earnedAt: 1,
};

describe('EngagementDashboard', () => {
	beforeEach(() => {
		mockRecentCredits = [];
		mockBadges = [];
	});

	it('shows the level counted from 1, never as a name', () => {
		const { container } = render(<EngagementDashboard />);

		expect(screen.getAllByText('רמה 4').length).toBeGreaterThan(0);
		expect(container.querySelector('.level-badge__icon')?.textContent).toBe('4');
		expect(screen.queryByText('Advocate')).toBeNull();
	});

	it('translates activity and shows the time in the reader language', () => {
		mockRecentCredits = [credit(1, CreditAction.CREATE_OPTION)];
		render(<EngagementDashboard />);

		expect(screen.getByText('הוספת תשובה')).toBeTruthy();
		expect(screen.getByLabelText('+10 נקודות')).toBeTruthy();
		expect(document.querySelector('time')?.textContent).toMatch(/[֐-׿]/);
	});

	it('keeps login and streak credits out of the activity list', () => {
		mockRecentCredits = [credit(1, CreditAction.STREAK_BONUS), credit(2, CreditAction.DAILY_LOGIN)];
		render(<EngagementDashboard />);

		expect(screen.getByText('engagement.noActivity')).toBeTruthy();
	});

	it('renders the badge as an icon with translated text', () => {
		mockBadges = [firstVoice];
		const { container } = render(<EngagementDashboard />);
		const icon = container.querySelector('.engagement-dashboard__badge-icon');

		expect(icon?.querySelector('svg')).not.toBeNull();
		expect(icon?.textContent).toBe('');
		expect(screen.getByText('קול ראשון')).toBeTruthy();
		expect(screen.getByLabelText('קול ראשון: דירגת את התשובה הראשונה שלך')).toBeTruthy();
	});

	it('falls back to the stored text for a badge it does not know', () => {
		mockBadges = [{ ...firstVoice, badgeId: 'future_badge', name: 'Future', icon: 'unknown' }];
		const { container } = render(<EngagementDashboard />);

		expect(screen.getByText('Future')).toBeTruthy();
		expect(container.querySelector('.engagement-dashboard__badge-icon svg')).not.toBeNull();
	});
});
