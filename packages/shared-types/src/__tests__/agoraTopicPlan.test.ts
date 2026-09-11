// Exercise the real persisted schema rather than the package's default valibot mock.
jest.unmock('valibot');

import { parse } from 'valibot';
import { AgoraStage } from '../models/agora/agoraEnums';
import { topicStagePlan, AgoraTopicPackageSchema } from '../models/agora/agoraTopicPackage';
import { stagePlanPreset, validateStagePlan } from '../models/agora/stagePlan';

describe('question-led scenario plan', () => {
	const authoringBrief = {
		statement: 'How can we solve this?',
		description: 'Find broad agreement.',
	};
	it('omits only vision, retaining stories, needs, improvement and voting', () => {
		const plan = topicStagePlan({ authoringBrief });
		expect(plan).toEqual(
			stagePlanPreset('scenarioWizcol').filter((item) => item.kind !== 'vision'),
		);
		expect(
			plan.filter((item) => item.stage === AgoraStage.question).map((item) => item.kind),
		).toEqual(['story', 'needs']);
		expect(validateStagePlan(plan, { hasCharacters: true })).toEqual([]);
	});
	it('does not change existing scenario defaults or share mutable plans', () => {
		expect(topicStagePlan()).toEqual(stagePlanPreset('scenarioWizcol'));
		const first = topicStagePlan({ authoringBrief });
		first.pop();
		expect(topicStagePlan({ authoringBrief }).at(-1)?.stage).toBe(AgoraStage.results);
	});
	it('retains both source fields through the shared schema', () => {
		const schema = AgoraTopicPackageSchema.entries.authoringBrief;
		expect(parse(schema, authoringBrief)).toEqual(authoringBrief);
	});
});
