import { Collections, type Statement, type User } from '@freedi/shared-types';
import { fakeDbFrom } from '../../__tests__/testUtils';

jest.mock('../../../db', () => {
	const { createFakeDb } = jest.requireActual('../../__tests__/fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../../../config/openai-chat', () => ({
	TAXONOMY_MODEL: 'test-model',
	callLLM: jest.fn(),
	extractJson: (s: string) => s,
}));

import * as dbModule from '../../../db';
import {
	buildSeedOption,
	cleanSeedOptions,
	generateSeedOptions,
	loadExistingOptions,
} from '../seedOptions';

const db = fakeDbFrom(dbModule);
const creator: User = {
	uid: 'alice',
	displayName: 'Alice',
	email: 'a@x.com',
	photoURL: '',
	isAnonymous: false,
};
const question = {
	statementId: 'q1',
	statement: 'Which ideas?',
	parentId: 'top-1',
	topParentId: 'top-1',
	parents: ['top-1'],
} as Statement;

describe('seedOptions', () => {
	it('cleans, dedupes and caps seed texts', () => {
		expect(
			cleanSeedOptions(['  A  b ', 'a b', '', 'x', 'C'.repeat(300)]).map((t) => t.length),
		).toEqual([3, 220]);
	});

	it('builds an option shaped like an MC suggestion', () => {
		const option = buildSeedOption({
			statementId: 'o1',
			question,
			text: 'Plant trees',
			creator,
			index: 2,
		});
		expect(option).toMatchObject({
			statementType: 'option',
			parentId: 'q1',
			topParentId: 'top-1',
			parents: ['top-1', 'q1'],
			sourceApp: 'mass-consensus',
			order: 2,
			creatorId: 'alice',
		});
		expect((option as unknown as { seededBy: string }).seededBy).toBe('studio-ai');
	});

	it('generates fixture seeds without an API key and lists existing options', async () => {
		delete process.env.OPENAI_API_KEY;
		const seeds = await generateSeedOptions({ question, languageCode: 'en', count: 4 });
		expect(seeds).toHaveLength(4);
		db.reset();
		db.seed(Collections.statements, 'o1', {
			statementId: 'o1',
			parentId: 'q1',
			statementType: 'option',
		});
		db.seed(Collections.statements, 'o2', {
			statementId: 'o2',
			parentId: 'q1',
			statementType: 'option',
			hide: true,
		});
		expect((await loadExistingOptions('q1')).map((o) => o.statementId)).toEqual(['o1']);
	});
});
