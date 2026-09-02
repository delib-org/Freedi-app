import { describe, it, expect } from 'vitest';
import {
	ActivityType,
	type StudioExistingActivitySnapshot,
	type StudioPlanActivity,
} from '@freedi/shared-types';
import { ACTION_GLYPHS, ACTION_LABELS, toActivityType } from '../planTypes';
import { draftSourcesOf, resolveSourceTitles } from '../planDocument';

describe('planTypes', () => {
	it('maps every consultant activity type onto an engine ActivityType', () => {
		expect(toActivityType('crowdSurvey')).toBe(ActivityType.massConsensus);
		expect(toActivityType('liveSession')).toBe(ActivityType.join);
		expect(toActivityType('discussion')).toBe(ActivityType.question);
		expect(toActivityType('document')).toBe(ActivityType.signDocument);
	});

	it('presents the draft action as a pen + the word Draft', () => {
		expect(ACTION_GLYPHS.draft).toBe('📝');
		expect(ACTION_LABELS.draft).toBe('Draft');
	});
});

describe('planDocument', () => {
	const activities: StudioPlanActivity[] = [
		{
			tempId: 'a1',
			type: 'crowdSurvey',
			title: 'Collect ideas',
			order: 0,
			openNow: true,
			change: 'add',
		},
		{
			tempId: 'a2',
			type: 'liveSession',
			title: 'Town hall',
			order: 1,
			openNow: false,
			change: 'update',
			existingStatementId: 'st-2',
		},
		{
			tempId: 'd1',
			type: 'document',
			title: 'The proposal',
			order: 2,
			openNow: false,
			change: 'add',
			draftFrom: ['a1', 'st-2', 'st-9'],
		},
	];
	const existing: StudioExistingActivitySnapshot[] = [
		{ statementId: 'st-9', type: 'crowdSurvey', title: 'Last year survey', order: 0 },
	];

	it('resolves tempIds, existing statementIds and snapshot ids to titles', () => {
		expect(resolveSourceTitles(['a1', 'st-2', 'st-9', 'nope'], activities, existing)).toEqual([
			'Collect ideas',
			'Town hall',
			'Last year survey',
			'nope',
		]);
		expect(resolveSourceTitles(undefined, activities, [])).toEqual([]);
	});

	it("a draft action's sources default to the target document's draftFrom", () => {
		expect(
			draftSourcesOf({ tempId: 's', activityTempId: 'd1', action: 'draft', at: 1 }, [
				...activities,
			]),
		).toEqual(['a1', 'st-2', 'st-9']);
		expect(
			draftSourcesOf(
				{ tempId: 's', activityTempId: 'd1', action: 'draft', at: 1, draftFrom: ['a1'] },
				activities,
			),
		).toEqual(['a1']);
	});
});
