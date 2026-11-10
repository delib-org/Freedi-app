import { CutoffBy, ResultsBy, Statement, StatementType } from '@freedi/shared-types';
import {
	countRated,
	getStageCue,
	getResultsAccess,
	rankAnswers,
	resultsRuleCaption,
	scoreLabelKey,
	scorePercent,
	scoreTone,
	selectLeadingAnswers,
} from '../resultsLogic';

function answer(id: string, consensus: number, evaluators: number, createdAt = 1): Statement {
	return {
		statementId: id,
		statement: id,
		statementType: StatementType.option,
		parentId: 'q1',
		topParentId: 'q1',
		creatorId: 'u1',
		createdAt,
		lastUpdate: 1,
		consensus,
		evaluation: { numberOfEvaluators: evaluators, agreement: consensus },
	} as Statement;
}

const base = { isHost: false, showLiveResults: true, isDeadlinePassed: false };

describe('resultsLogic', () => {
	describe('getResultsAccess (gating)', () => {
		it('hides results mid-flow until the viewer rated something', () => {
			expect(getResultsAccess({ ...base, stage: 1, ratedCount: 0 })).toBe('rate-first');
			expect(getResultsAccess({ ...base, stage: 2, ratedCount: 0 })).toBe('rate-first');
			expect(getResultsAccess({ ...base, stage: 1, ratedCount: 1 })).toBe('visible');
		});

		it('decided questions and passed deadlines are always readable', () => {
			expect(getResultsAccess({ ...base, stage: 3, ratedCount: 0, showLiveResults: false })).toBe(
				'visible',
			);
			expect(getResultsAccess({ ...base, stage: 1, ratedCount: 0, isDeadlinePassed: true })).toBe(
				'visible',
			);
		});

		it('while collecting, results are readable without rating', () => {
			expect(getResultsAccess({ ...base, stage: 0, ratedCount: 0 })).toBe('visible');
		});

		it('respects the host switching live results off', () => {
			expect(getResultsAccess({ ...base, stage: 1, ratedCount: 5, showLiveResults: false })).toBe(
				'hidden-by-host',
			);
		});

		it('hosts always see results', () => {
			expect(
				getResultsAccess({
					...base,
					isHost: true,
					stage: 1,
					ratedCount: 0,
					showLiveResults: false,
				}),
			).toBe('visible');
		});
	});

	describe('ranking and selection', () => {
		const answers = [
			answer('low', 0.1, 6),
			answer('unrated', 0, 0),
			answer('high', 0.8, 9),
			answer('mid', 0.55, 7),
		];

		it('ranks rated answers by consensus, unrated last', () => {
			expect(rankAnswers(answers).map((a) => a.statementId)).toEqual([
				'high',
				'mid',
				'low',
				'unrated',
			]);
		});

		it('drops hidden answers and non-synthesis clusters', () => {
			const hidden = { ...answer('hidden', 0.9, 3), hide: true } as Statement;
			const cluster = { ...answer('cluster', 0.9, 3), isCluster: true } as Statement;
			expect(rankAnswers([hidden, cluster, answer('a', 0.2, 1)]).map((a) => a.statementId)).toEqual(
				['a'],
			);
		});

		it('top N takes the first N rated answers', () => {
			const settings = {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.topOptions,
				numberOfResults: 2,
			};
			expect(selectLeadingAnswers(answers, settings).map((a) => a.statementId)).toEqual([
				'high',
				'mid',
			]);
		});

		it('a threshold takes every rated answer at or above it', () => {
			const settings = {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.aboveThreshold,
				cutoffNumber: 0.55,
			};
			expect(selectLeadingAnswers(answers, settings).map((a) => a.statementId)).toEqual([
				'high',
				'mid',
			]);
		});

		it('`all` takes every rated answer, never an unrated one', () => {
			const settings = { resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.all };
			expect(selectLeadingAnswers(answers, settings)).toHaveLength(3);
		});

		it('falls back to the shared default selection', () => {
			expect(selectLeadingAnswers(answers, undefined).length).toBeGreaterThan(0);
		});
	});

	describe('resultsRuleCaption', () => {
		it('names the threshold', () => {
			const settings = {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.aboveThreshold,
				cutoffNumber: 0.6,
			};
			expect(resultsRuleCaption(settings, false)).toEqual({
				key: 'Above the agreement threshold ({n})',
				value: '0.6',
			});
			expect(resultsRuleCaption(settings, true).key).toBe('By consensus · threshold {n}');
		});

		it('names top N and all', () => {
			expect(
				resultsRuleCaption(
					{ resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.topOptions, numberOfResults: 3 },
					false,
				),
			).toEqual({ key: 'Top {n} by agreement', value: '3' });
			expect(
				resultsRuleCaption({ resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.all }, true).key,
			).toBe('Every rated answer, by agreement');
		});
	});

	describe('getStageCue', () => {
		const base = {
			isHalted: false,
			canRate: true,
			canAddAnswer: true,
			usesVotingUI: false,
			hasVoted: false,
			ratedCount: 0,
			rateableCount: 4,
		};
		type Ability = 'both' | 'add' | 'rate' | 'neither';
		const ability = (who: Ability) => ({
			canAddAnswer: who === 'both' || who === 'add',
			canRate: who === 'both' || who === 'rate',
		});
		const progress = {
			nothing: { ratedCount: 0, rateableCount: 0 },
			none: { ratedCount: 0, rateableCount: 4 },
			some: { ratedCount: 1, rateableCount: 4 },
			all: { ratedCount: 4, rateableCount: 4 },
		} as const;
		type Progress = keyof typeof progress;

		const table = (rows: Record<Ability, [string, string, string, string]>) =>
			(Object.keys(rows) as Ability[]).flatMap((who) =>
				(Object.keys(progress) as Progress[]).map(
					(step, column) => [who, step, rows[who][column]] as const,
				),
			);

		describe('Collecting', () => {
			it.each(
				table({
					both: ['noneToRateAdd', 'addOrRate', 'moreToRateAdd', 'ratedAllAdd'],
					add: ['addRatingLater', 'addRatingLater', 'addRatingLater', 'addRatingLater'],
					rate: ['noneToRate', 'rateEach', 'moreToRate', 'ratedAll'],
					neither: ['collectingRead', 'collectingRead', 'collectingRead', 'collectingRead'],
				}),
			)('%s / %s: %s', (who, step, name) => {
				expect(getStageCue({ ...base, stage: 0, ...ability(who), ...progress[step] }).key).toBe(
					`stageCue.${name}`,
				);
			});
		});

		describe('Rating', () => {
			it.each(
				table({
					both: ['noneToRateAdd', 'rateEach', 'moreToRate', 'ratedAllAdd'],
					add: ['ratingClosedAdd', 'ratingClosedAdd', 'ratingClosedAdd', 'ratingClosedAdd'],
					rate: ['noneToRate', 'rateEach', 'moreToRate', 'ratedAll'],
					neither: ['ratingClosedRead', 'ratingClosedRead', 'ratingClosedRead', 'ratingClosedRead'],
				}),
			)('%s / %s: %s', (who, step, name) => {
				expect(getStageCue({ ...base, stage: 1, ...ability(who), ...progress[step] }).key).toBe(
					`stageCue.${name}`,
				);
			});
		});

		describe('Voting', () => {
			const voting = { ...base, stage: 2 as const, usesVotingUI: true };

			it.each([
				['both', 'noneToVoteAdd', 'voteOrAdd', 'votedAdd'],
				['add', 'votingClosedAdd', 'votingClosedAdd', 'votingClosedAdd'],
				['rate', 'noneToVote', 'voteOne', 'voted'],
				['neither', 'votingClosedRead', 'votingClosedRead', 'votingClosedRead'],
			] as const)('%s: %s / %s / %s', (who, nothing, notVoted, voted) => {
				const can = ability(who);
				expect(getStageCue({ ...voting, ...can, ...progress.nothing }).key).toBe(
					`stageCue.${nothing}`,
				);
				expect(getStageCue({ ...voting, ...can }).key).toBe(`stageCue.${notVoted}`);
				expect(getStageCue({ ...voting, ...can, hasVoted: true }).key).toBe(`stageCue.${voted}`);
			});

			it('progress is "has voted", never the rated count', () => {
				expect(getStageCue({ ...voting, ...ability('rate'), ...progress.some }).key).toBe(
					'stageCue.voteOne',
				);
			});

			it("a vote on the only answer, the person's own, still reads as voted", () => {
				expect(
					getStageCue({ ...voting, ...ability('rate'), hasVoted: true, ...progress.nothing }).key,
				).toBe('stageCue.voted');
			});
		});

		describe('selection order', () => {
			it('Decided wins over halted and over the voting UI', () => {
				expect(getStageCue({ ...base, stage: 3, isHalted: true, usesVotingUI: true }).key).toBe(
					'stageCue.over',
				);
			});

			it('halted wins over every stage table', () => {
				expect(getStageCue({ ...base, stage: 0, isHalted: true }).key).toBe('stageCue.closed');
				expect(getStageCue({ ...base, stage: 2, isHalted: true, usesVotingUI: true }).key).toBe(
					'stageCue.closed',
				);
			});

			it('someone who can vote on a voting UI gets the voting table in any stage', () => {
				expect(getStageCue({ ...base, stage: 1, usesVotingUI: true }).key).toBe(
					'stageCue.voteOrAdd',
				);
			});

			it('without the ability to vote, a voting UI falls back to the actual stage', () => {
				expect(getStageCue({ ...base, stage: 1, usesVotingUI: true, ...ability('add') }).key).toBe(
					'stageCue.ratingClosedAdd',
				);
			});
		});

		it('counts what is left to rate, and only on the counting cues', () => {
			expect(getStageCue({ ...base, stage: 1, ...progress.some })).toEqual({
				key: 'stageCue.moreToRate',
				value: '3',
			});
			expect(getStageCue({ ...base, stage: 0, ...progress.some })).toEqual({
				key: 'stageCue.moreToRateAdd',
				value: '3',
			});
			expect(getStageCue({ ...base, stage: 1 }).value).toBeUndefined();
		});
	});

	it('countRated counts distinct own ratings among these answers', () => {
		const evaluations = [
			{ statementId: 'a', evaluatorId: 'me' },
			{ statementId: 'a', evaluatorId: 'me' },
			{ statementId: 'b', evaluatorId: 'other' },
			{ statementId: 'z', evaluatorId: 'me' },
		];
		expect(countRated(evaluations, ['a', 'b'], 'me')).toBe(1);
		expect(countRated(evaluations, ['a'], undefined)).toBe(0);
	});

	it('score helpers', () => {
		expect(scoreTone(0.3)).toBe('positive');
		expect(scoreTone(0)).toBe('split');
		expect(scoreTone(-0.1)).toBe('negative');
		expect(scorePercent(-1)).toBe(0);
		expect(scorePercent(0)).toBe(50);
		expect(scorePercent(2)).toBe(100);
		expect([0.6, 0.3, 0, -0.1].map(scoreLabelKey)).toEqual([
			'Broad agreement',
			'Partial agreement',
			'Split',
			'Opposition',
		]);
	});
});
