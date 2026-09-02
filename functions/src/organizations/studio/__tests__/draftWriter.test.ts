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
	applyCutoff,
	fixtureDraft,
	loadDraftSources,
	parseDraft,
	writeDraftParagraphs,
	type DraftSource,
	type DraftSuggestion,
} from '../draftWriter';

const db = fakeDbFrom(dbModule);
const DOC = 'doc-1';
const SRC = 'survey-1';
const creator: User = {
	uid: 'alice',
	displayName: 'Alice',
	email: 'a@x.com',
	photoURL: '',
	isAnonymous: false,
};

function sugg(
	id: string,
	consensus: number,
	raters: number,
	extra: Record<string, unknown> = {},
): void {
	db.seed(Collections.statements, id, {
		statementId: id,
		statement: `Suggestion ${id}`,
		statementType: 'option',
		parentId: SRC,
		topParentId: 'top-1',
		consensus,
		evaluation: { numberOfEvaluators: raters },
		...extra,
	});
}

function s(id: string, consensus: number, n: number): DraftSuggestion {
	return { statementId: id, sourceId: SRC, text: id, consensus, numberOfEvaluators: n };
}

describe('applyCutoff', () => {
	const all = [s('a', 0.9, 10), s('b', 0.7, 2), s('c', 0.5, 6), s('d', 0.1, 8)];

	it('topN keeps the best N with enough raters', () => {
		expect(
			applyCutoff(all, { mode: 'topN', n: 2, minEvaluators: 3 }, new Set()).map(
				(x) => x.statementId,
			),
		).toEqual(['a', 'c']);
	});

	it('threshold keeps consensus at or above the minimum', () => {
		expect(
			applyCutoff(all, { mode: 'threshold', minConsensus: 0.5 }, new Set()).map(
				(x) => x.statementId,
			),
		).toEqual(['a', 'b', 'c']);
	});

	it('chosen keeps the top answers, falling back to topN when none are chosen', () => {
		expect(
			applyCutoff(all, { mode: 'chosen' }, new Set(['c', 'd'])).map((x) => x.statementId),
		).toEqual(['c', 'd']);
		expect(applyCutoff(all, { mode: 'chosen' }, new Set()).length).toBe(4);
	});
});

describe('loadDraftSources', () => {
	beforeEach(() => {
		db.reset();
		db.seed(Collections.statements, SRC, {
			statementId: SRC,
			statement: 'Which ideas?',
			parentId: 'top-1',
			topParentId: 'top-1',
		});
		sugg('s1', 0.8, 5);
		sugg('s2', 0.6, 5, { hide: true });
		sugg('s3', 0.9, 5, { integratedInto: 'cluster-1' });
		sugg('cluster-1', 0.9, 9, { isCluster: true, integratedOptions: ['s3'] });
	});

	it('excludes hidden and absorbed suggestions, keeps clusters', async () => {
		const sources = await loadDraftSources([SRC], { mode: 'topN', n: 10 });
		expect(sources).toHaveLength(1);
		expect(sources[0].suggestions.map((x) => x.statementId)).toEqual(['cluster-1', 's1']);
	});
});

describe('parseDraft', () => {
	const sources: DraftSource[] = [
		{
			statement: { statementId: SRC, statement: 'Q' } as Statement,
			suggestions: [s('s1', 0.8, 5)],
		},
	];

	it('keeps only known source ids and drops empty paragraphs', () => {
		const draft = parseDraft(
			{
				title: 'Plan',
				sections: [
					{
						heading: 'A',
						paragraphs: [{ text: 'Do X', sourceIds: ['s1', 'ghost'] }, { text: '  ' }],
					},
					{ heading: 'Empty', paragraphs: [{ text: '' }] },
				],
				openGaps: [{ text: 'Who pays?', sourceIds: ['s1'] }],
			},
			sources,
		);
		expect(draft.sections).toHaveLength(1);
		expect(draft.sections[0].paragraphs[0].sourceIds).toEqual(['s1']);
		expect(draft.openGaps).toHaveLength(1);
	});

	it('rejects a draft without sections', () => {
		expect(() => parseDraft({ title: 'x', sections: [] }, sources)).toThrow();
	});
});

describe('writeDraftParagraphs', () => {
	const sources: DraftSource[] = [
		{
			statement: { statementId: SRC, statement: 'Which ideas?' } as Statement,
			suggestions: [s('s1', 0.8, 5), s('s2', 0.6, 4)],
		},
	];

	beforeEach(() => {
		db.reset();
		db.seed(Collections.statements, DOC, {
			statementId: DOC,
			statement: 'Doc',
			statementType: 'document',
			parentId: 'top-1',
			topParentId: 'top-1',
			isDocument: true,
		});
	});

	function paragraphs(): Statement[] {
		return [...(db.store.get(Collections.statements)?.values() ?? [])]
			.filter((d) => d.parentId === DOC && d.hide !== true)
			.sort((a, b) => (a.order as number) - (b.order as number)) as unknown as Statement[];
	}

	it('writes headings, paragraphs with provenance and an open-questions section', async () => {
		const draft = fixtureDraft(sources, 'Main?');
		draft.openGaps = [{ text: 'Who pays?', sourceIds: ['s1'] }];
		const result = await writeDraftParagraphs({
			document: db.read(Collections.statements, DOC) as unknown as Statement,
			draft,
			sources,
			creator,
			runId: 'run-1',
			languageCode: 'en',
			now: 1000,
		});
		expect(result).toEqual({ paragraphCount: 2, openGaps: 1 });
		const rows = paragraphs();
		expect(rows.map((p) => p.blockType)).toEqual(['h2', 'paragraph', 'paragraph', 'h2', 'li']);
		expect(rows[1].statementType).toBe('paragraph');
		expect(rows[1].doc?.isOfficialParagraph).toBe(true);
		expect(rows[1].derivedFromStatementId).toBe('s1');
		expect(
			(rows[1] as unknown as { draftProvenance: { sources: unknown[] } }).draftProvenance.sources,
		).toEqual([{ statementId: 's1', consensus: 0.8, numberOfEvaluators: 5 }]);
		expect(rows[3].statement).toBe('Open questions');
		expect(db.read(Collections.statements, DOC)?.lastDraftRunId).toBe('run-1');
	});

	it('hides earlier AI paragraphs and keeps human ones after the new text', async () => {
		db.seed(Collections.statements, 'old-ai', {
			statementId: 'old-ai',
			statement: 'old',
			statementType: 'paragraph',
			parentId: DOC,
			order: 0,
			draftProvenance: { draftRunId: 'run-0', sources: [] },
		});
		db.seed(Collections.statements, 'human', {
			statementId: 'human',
			statement: 'Preamble by Sigal',
			statementType: 'paragraph',
			parentId: DOC,
			order: 1,
		});
		await writeDraftParagraphs({
			document: db.read(Collections.statements, DOC) as unknown as Statement,
			draft: fixtureDraft(sources, 'Main?'),
			sources,
			creator,
			runId: 'run-2',
			languageCode: 'he',
			now: 2000,
		});
		expect(db.read(Collections.statements, 'old-ai')?.hide).toBe(true);
		const rows = paragraphs();
		expect(rows[rows.length - 1].statementId).toBe('human');
		expect(rows[rows.length - 1].order).toBe(3);
	});
});
