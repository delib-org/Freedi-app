import { ActivityType, SourceApp } from '@freedi/shared-types';
import { createActivityUrlResolver } from '../activityUrls';

const base = {
	mainAppBaseUrl: 'https://app.test/',
	massConsensusBaseUrl: 'https://mc.test',
	signBaseUrl: 'https://sign.test',
};

describe('createActivityUrlResolver — join links', () => {
	describe('with joinBaseUrl', () => {
		const resolver = createActivityUrlResolver({ ...base, joinBaseUrl: 'https://join.test/' });

		it('resolves participant and admin links to the same /q/{id} route', () => {
			expect(resolver.getParticipantLink(ActivityType.join, 'q1')).toEqual({
				href: 'https://join.test/q/q1',
				external: true,
			});
			expect(resolver.getAdminLink(ActivityType.join, 'q1')).toEqual({
				href: 'https://join.test/q/q1',
				external: true,
			});
		});

		it('resolves the top-question hub to /m/{id}', () => {
			expect(resolver.getJoinHubLink('top-1')).toEqual({
				href: 'https://join.test/m/top-1',
				external: true,
			});
		});

		it('keeps the route-link for SourceApp.JOIN', () => {
			expect(resolver.getRouteLink(SourceApp.JOIN, 'q1')?.href).toBe('https://join.test/q/q1');
		});
	});

	describe('without joinBaseUrl', () => {
		const resolver = createActivityUrlResolver(base);

		it('returns null for every join link', () => {
			expect(resolver.getParticipantLink(ActivityType.join, 'q1')).toBeNull();
			expect(resolver.getAdminLink(ActivityType.join, 'q1')).toBeNull();
			expect(resolver.getJoinHubLink('top-1')).toBeNull();
			expect(resolver.getRouteLink(SourceApp.JOIN, 'q1')).toBeNull();
		});

		it('still resolves the other engines', () => {
			expect(resolver.getParticipantLink(ActivityType.massConsensus, 'q1')?.href).toBe(
				'https://mc.test/q/q1',
			);
			expect(resolver.getAdminLink(ActivityType.question, 'q1')?.href).toBe(
				'https://app.test/statement-screen/q1/settings',
			);
		});
	});
});

describe('survey links (Studio → Mass-Consensus)', () => {
	const resolver = createActivityUrlResolver({
		mainAppBaseUrl: 'https://app.test',
		massConsensusBaseUrl: 'https://mc.test/',
		signBaseUrl: 'https://sign.test',
	});

	it('points participants at /s/{surveyId} and admins at /admin/surveys/{surveyId}', () => {
		expect(resolver.getSurveyLinks('S1')).toEqual({
			participant: { href: 'https://mc.test/s/S1', external: true },
			admin: { href: 'https://mc.test/admin/surveys/S1', external: true },
		});
	});

	it('builds the pre-seeded new-survey URL with an encoded returnTo', () => {
		const link = resolver.getNewSurveyLink({
			questionId: 'Q1',
			parentStatementId: 'TOP',
			returnTo: 'https://studio.test/orgs/o/questions/TOP?activity=Q1',
		});
		const url = new URL(link.href);
		expect(url.pathname).toBe('/admin/surveys/new');
		expect(url.searchParams.get('questionId')).toBe('Q1');
		expect(url.searchParams.get('parentStatementId')).toBe('TOP');
		expect(url.searchParams.get('returnTo')).toBe('https://studio.test/orgs/o/questions/TOP?activity=Q1');
	});
});
