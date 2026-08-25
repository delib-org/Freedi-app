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
