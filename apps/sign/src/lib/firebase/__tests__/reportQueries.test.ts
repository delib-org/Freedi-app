/**
 * Tests for reportQueries - Document Report aggregation helpers
 */

import type { ParagraphReport, ReportComment } from '@freedi/shared-types';

// Mock dependencies
jest.mock('../admin', () => ({
	getFirestoreAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

jest.mock('../queries', () => ({
	getDocumentParagraphs: jest.fn(),
}));

jest.mock('../exportQueries', () => ({
	createAnonymousIdMap: jest.fn(),
	getAllDocumentUserIds: jest.fn(),
	getDemographicQuestionsForExport: jest.fn(),
	getAnonymizedDemographicAnswers: jest.fn(),
}));

import {
	buildInsights,
	capComments,
	buildDemographicSummaries,
	paragraphSupport,
} from '../reportQueries';

function makeParagraph(overrides: Partial<ParagraphReport> & { paragraphId: string; order: number }): ParagraphReport {
	return {
		textPreview: 'text',
		views: { total: 0, uniqueViewers: 0, avgDurationSeconds: null, readThroughPct: 0 },
		approval: { approved: 0, totalVoters: 0, averageApproval: 0 },
		evaluations: { pro: 0, con: 0, avg: 0, total: 0 },
		comments: { count: 0, items: [] },
		...overrides,
	};
}

function makeComment(overrides: Partial<ReportComment>): ReportComment {
	return {
		anonymousId: 'user_1',
		text: 'comment',
		likes: 0,
		dislikes: 0,
		createdAt: 1,
		...overrides,
	};
}

describe('reportQueries', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('buildInsights', () => {
		it('builds a read-through curve in paragraph order', () => {
			const insights = buildInsights([
				makeParagraph({
					paragraphId: 'p1',
					order: 0,
					views: { total: 10, uniqueViewers: 10, avgDurationSeconds: 8, readThroughPct: 1 },
				}),
				makeParagraph({
					paragraphId: 'p2',
					order: 1,
					views: { total: 6, uniqueViewers: 6, avgDurationSeconds: 8, readThroughPct: 0.6 },
				}),
			]);

			expect(insights.readThroughCurve).toEqual([
				{ order: 0, paragraphId: 'p1', retention: 1 },
				{ order: 1, paragraphId: 'p2', retention: 0.6 },
			]);
		});

		it('flags drop-off when retention falls more than the threshold', () => {
			const insights = buildInsights([
				makeParagraph({
					paragraphId: 'p1',
					order: 0,
					views: { total: 10, uniqueViewers: 10, avgDurationSeconds: null, readThroughPct: 1 },
				}),
				makeParagraph({
					paragraphId: 'p2',
					order: 1,
					views: { total: 5, uniqueViewers: 5, avgDurationSeconds: null, readThroughPct: 0.5 },
				}),
				makeParagraph({
					paragraphId: 'p3',
					order: 2,
					views: { total: 5, uniqueViewers: 5, avgDurationSeconds: null, readThroughPct: 0.45 },
				}),
			]);

			expect(insights.dropOff).toHaveLength(1);
			expect(insights.dropOff[0]).toEqual({
				paragraphId: 'p2',
				order: 1,
				retentionBefore: 1,
				retentionAfter: 0.5,
			});
		});

		it('ranks consensus and friction only among paragraphs with enough voters', () => {
			const insights = buildInsights([
				makeParagraph({
					paragraphId: 'few-voters',
					order: 0,
					approval: { approved: 0, totalVoters: 1, averageApproval: 0 },
				}),
				makeParagraph({
					paragraphId: 'loved',
					order: 1,
					approval: { approved: 9, totalVoters: 10, averageApproval: 0.9 },
				}),
				makeParagraph({
					paragraphId: 'contested',
					order: 2,
					approval: { approved: 2, totalVoters: 10, averageApproval: 0.2 },
				}),
			]);

			expect(insights.topConsensus[0].paragraphId).toBe('loved');
			expect(insights.topFriction[0].paragraphId).toBe('contested');
			expect(insights.topConsensus.map((r) => r.paragraphId)).not.toContain('few-voters');
			expect(insights.topFriction.map((r) => r.paragraphId)).not.toContain('few-voters');
		});

		it('ranks paragraphs by ±1 evaluations when no boolean approvals exist', () => {
			const insights = buildInsights([
				makeParagraph({
					paragraphId: 'liked',
					order: 0,
					evaluations: { pro: 5, con: 0, avg: 1, total: 5 },
				}),
				makeParagraph({
					paragraphId: 'contested',
					order: 1,
					evaluations: { pro: 1, con: 4, avg: -0.6, total: 5 },
				}),
				makeParagraph({
					paragraphId: 'unvoted',
					order: 2,
				}),
			]);

			expect(insights.topConsensus[0].paragraphId).toBe('liked');
			expect(insights.topConsensus[0].score).toBe(1);
			expect(insights.topFriction[0].paragraphId).toBe('contested');
			expect(insights.topFriction[0].score).toBe(0.2);
			expect(insights.topConsensus.map((r) => r.paragraphId)).not.toContain('unvoted');
		});

		it('excludes fully approved paragraphs from friction', () => {
			const insights = buildInsights([
				makeParagraph({
					paragraphId: 'perfect',
					order: 0,
					approval: { approved: 5, totalVoters: 5, averageApproval: 1 },
				}),
			]);

			expect(insights.topFriction).toHaveLength(0);
			expect(insights.topConsensus).toHaveLength(1);
		});
	});

	describe('paragraphSupport', () => {
		it('prefers boolean approvals when both mechanisms have votes', () => {
			const support = paragraphSupport(
				makeParagraph({
					paragraphId: 'p',
					order: 0,
					approval: { approved: 3, totalVoters: 4, averageApproval: 0.75 },
					evaluations: { pro: 1, con: 1, avg: 0, total: 2 },
				})
			);

			expect(support).toEqual({ value: 0.75, voters: 4, source: 'approval' });
		});

		it('maps ±1 evaluation average to a 0..1 support level', () => {
			const support = paragraphSupport(
				makeParagraph({
					paragraphId: 'p',
					order: 0,
					evaluations: { pro: 1, con: 4, avg: -0.6, total: 5 },
				})
			);

			expect(support).toEqual({ value: 0.2, voters: 5, source: 'evaluations' });
		});

		it('returns null when nobody voted', () => {
			expect(paragraphSupport(makeParagraph({ paragraphId: 'p', order: 0 }))).toBeNull();
		});
	});

	describe('capComments', () => {
		it('returns all comments sorted by net likes when under the cap', () => {
			const comments = [
				makeComment({ text: 'meh', likes: 0, createdAt: 1 }),
				makeComment({ text: 'great', likes: 5, createdAt: 2 }),
			];

			const result = capComments(comments);

			expect(result).toHaveLength(2);
			expect(result[0].text).toBe('great');
		});

		it('caps large sets keeping the most-liked and most-disliked poles', () => {
			const liked = Array.from({ length: 30 }, (_, i) =>
				makeComment({ text: `liked-${i}`, likes: 30 - i, createdAt: i })
			);
			const disliked = Array.from({ length: 10 }, (_, i) =>
				makeComment({ text: `disliked-${i}`, dislikes: 10 - i, createdAt: 100 + i })
			);

			const result = capComments([...liked, ...disliked]);

			expect(result).toHaveLength(20);
			expect(result.filter((c) => c.text.startsWith('liked-'))).toHaveLength(15);
			expect(result.filter((c) => c.text.startsWith('disliked-'))).toHaveLength(5);
			expect(result.map((c) => c.text)).toContain('disliked-0');
		});
	});

	describe('buildDemographicSummaries', () => {
		const question = { questionId: 'q1', text: 'Age group', options: ['18-30', '31-50'] };

		it('counts respondents per answer', () => {
			const summaries = buildDemographicSummaries(
				[question],
				[
					{ questionId: 'q1', answer: '18-30', answerOptions: null, anonymousId: 'user_1' },
					{ questionId: 'q1', answer: '18-30', answerOptions: null, anonymousId: 'user_2' },
					{ questionId: 'q1', answer: '31-50', answerOptions: null, anonymousId: 'user_3' },
				],
				0
			);

			expect(summaries).toHaveLength(1);
			expect(summaries[0].totalRespondents).toBe(3);
			const young = summaries[0].answers.find((a) => a.answer === '18-30');
			expect(young?.count).toBe(2);
			expect(young?.suppressedByKAnonymity).toBe(false);
		});

		it('suppresses answers below the k-anonymity floor', () => {
			const summaries = buildDemographicSummaries(
				[question],
				[
					{ questionId: 'q1', answer: '18-30', answerOptions: null, anonymousId: 'user_1' },
					{ questionId: 'q1', answer: '18-30', answerOptions: null, anonymousId: 'user_2' },
				],
				5
			);

			const young = summaries[0].answers.find((a) => a.answer === '18-30');
			expect(young?.suppressedByKAnonymity).toBe(true);
			expect(young?.count).toBe(0);
		});

		it('counts multi-select answerOptions', () => {
			const summaries = buildDemographicSummaries(
				[{ questionId: 'q2', text: 'Interests', options: ['a', 'b'] }],
				[
					{ questionId: 'q2', answer: null, answerOptions: ['a', 'b'], anonymousId: 'user_1' },
					{ questionId: 'q2', answer: null, answerOptions: ['a'], anonymousId: 'user_2' },
				],
				0
			);

			expect(summaries[0].answers.find((a) => a.answer === 'a')?.count).toBe(2);
			expect(summaries[0].answers.find((a) => a.answer === 'b')?.count).toBe(1);
		});
	});
});
