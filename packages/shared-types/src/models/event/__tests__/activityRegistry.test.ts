import {
	ACTIVITY_REGISTRY,
	ActivityType,
	getActivityDef,
	getActivityType,
	isActivityStatement,
} from '../activityRegistry';
import { QuestionType, StatementType } from '../../TypeEnums';
import { SourceApp } from '../../engagement/SourceApp';
import type { Statement } from '../../statement/StatementTypes';

function statementOf(overrides: Partial<Statement>): Statement {
	return {
		statementId: 's1',
		statement: 'title',
		creatorId: 'u1',
		creator: { uid: 'u1', displayName: 'U', isAnonymous: false },
		parentId: 'top',
		topParentId: 's1',
		statementType: StatementType.question,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

describe('activityRegistry', () => {
	describe('ActivityType.join', () => {
		it('is registered with the join engine and a questionStatus run-state', () => {
			const def = getActivityDef(ActivityType.join);
			expect(def.type).toBe(ActivityType.join);
			expect(def.sourceApp).toBe(SourceApp.JOIN);
			expect(def.statusSource).toBe('questionStatus');
			expect(def.hasParticipantUrl).toBe(true);
			expect(def.hasAdminUrl).toBe(true);
			expect(def.icon).toBe('🤝');
		});

		it('has a registry entry for every ActivityType member', () => {
			for (const type of Object.values(ActivityType)) {
				expect(ACTIVITY_REGISTRY[type]).toBeDefined();
				expect(ACTIVITY_REGISTRY[type].type).toBe(type);
			}
		});
	});

	describe('getActivityType', () => {
		it('classifies a join-app question as join', () => {
			const s = statementOf({ sourceApp: SourceApp.JOIN });
			expect(getActivityType(s)).toBe(ActivityType.join);
		});

		/**
		 * Precedence: the `sourceApp === JOIN` check runs BEFORE the questionType
		 * switch, so a join question that also carries
		 * `questionType: massConsensus` classifies as join, NOT massConsensus.
		 * The engine that created the question decides how it is run.
		 */
		it('lets sourceApp JOIN win over questionType massConsensus', () => {
			const s = statementOf({
				sourceApp: SourceApp.JOIN,
				questionSettings: { questionType: QuestionType.massConsensus },
			});
			expect(getActivityType(s)).toBe(ActivityType.join);
		});

		it('still classifies a non-join massConsensus question as massConsensus', () => {
			const s = statementOf({
				sourceApp: SourceApp.MASS_CONSENSUS,
				questionSettings: { questionType: QuestionType.massConsensus },
			});
			expect(getActivityType(s)).toBe(ActivityType.massConsensus);
		});

		it('does not classify a join-app non-question as join', () => {
			const s = statementOf({ sourceApp: SourceApp.JOIN, statementType: StatementType.option });
			expect(getActivityType(s)).toBe(ActivityType.unknown);
			expect(isActivityStatement(s)).toBe(false);
		});

		it('classifies documents and plain questions as before', () => {
			expect(getActivityType(statementOf({ statementType: StatementType.document }))).toBe(
				ActivityType.signDocument,
			);
			expect(getActivityType(statementOf({}))).toBe(ActivityType.question);
			expect(
				getActivityType(
					statementOf({ questionSettings: { questionType: QuestionType.multiStage } }),
				),
			).toBe(ActivityType.multiStage);
		});
	});
});
