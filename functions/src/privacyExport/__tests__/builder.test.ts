import {
	Collections,
	StatementType,
	calcAgreement,
	calcAgreementIndex,
	type Evaluation,
	type Statement,
} from '@freedi/shared-types';
import { createFakeFirestore, type FakeData } from './fakeFirestore';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let fakeData: FakeData = {};
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => createFakeFirestore(fakeData),
}));

import { buildPrivacyExport } from '../builder';
import { computeClusterEvaluationFromRawEvals } from '../../condensation/aggregation';
import type { OptionEvaluationSummary } from '../types';

const Q = 'q1';

function question(fields: Partial<Statement> = {}): Statement {
	return {
		statementId: Q,
		parentId: 'top',
		topParentId: 'top',
		statement: 'What should we do?',
		statementType: StatementType.question,
		...fields,
	} as Statement;
}

function option(id: string, fields: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		parentId: Q,
		statement: `text ${id}`,
		statementType: StatementType.option,
		creatorId: `author-${id}`,
		...fields,
	} as Statement;
}

function vote(uid: string, statementId: string, value: number, parentId = Q): Evaluation {
	return {
		evaluationId: `${uid}--${statementId}`,
		evaluatorId: uid,
		evaluator: { uid },
		statementId,
		parentId,
		evaluation: value,
	} as unknown as Evaluation;
}

function seed(statements: Statement[], evaluations: Evaluation[]): void {
	fakeData = {
		[Collections.statements]: statements as unknown as FakeData[string],
		[Collections.evaluations]: evaluations as unknown as FakeData[string],
		[Collections.userDemographicQuestions]: [],
		[Collections.usersData]: [],
	};
}

function byId(options: OptionEvaluationSummary[], id: string): OptionEvaluationSummary {
	const found = options.find((o) => o.statementId === id);
	if (!found) throw new Error(`option ${id} not in export`);

	return found;
}

/** Number of maximal runs of equal consecutive values. */
function runCount(values: number[]): number {
	return values.reduce((runs, v, i) => (i === 0 || v !== values[i - 1] ? runs + 1 : runs), 0);
}

describe('buildPrivacyExport — plain options', () => {
	it('adds agreement and agreementIndex from the direct votes, 3-arg without N', async () => {
		seed(
			[question(), option('a')],
			[vote('u1', 'a', 1), vote('u2', 'a', 0.5), vote('u3', 'a', -1)],
		);

		const result = await buildPrivacyExport({ statementId: Q });
		const a = byId(result.optionEvaluations, 'a');

		expect(a.statsMethod).toBe('direct');
		expect(a.mergedTotalEvaluators).toBeUndefined();
		expect(a.agreement).toBeCloseTo(calcAgreement(0.5, 2.25, 3), 10);
		expect(a.agreementIndex).toBeCloseTo(calcAgreementIndex(0.5, 2.25, 3), 10);
		expect(result.metadata.fpcApplied).toBe(false);
		expect(result.metadata.stakeholderCount).toBeUndefined();
	});

	it('uses the 4-arg formula with the question N and reports fpcApplied', async () => {
		seed(
			[
				question({ evaluationSettings: { targetPopulation: 10 } } as Partial<Statement>),
				option('a'),
			],
			[vote('u1', 'a', 1), vote('u2', 'a', 0.5), vote('u3', 'a', -1)],
		);

		const result = await buildPrivacyExport({ statementId: Q });
		const a = byId(result.optionEvaluations, 'a');

		expect(a.agreement).toBeCloseTo(calcAgreement(0.5, 2.25, 3, 10), 10);
		expect(a.agreementIndex).toBeCloseTo(calcAgreementIndex(0.5, 2.25, 3, 10), 10);
		expect(a.agreement).not.toBeCloseTo(calcAgreement(0.5, 2.25, 3), 6);
		expect(result.metadata.fpcApplied).toBe(true);
		expect(result.metadata.stakeholderCount).toBe(10);
	});

	it('reads N from the top statement when the question has none', async () => {
		const top = {
			statementId: 'top',
			parentId: 'top',
			statement: 'group',
			statementType: StatementType.group,
			evaluationSettings: { targetPopulation: 40 },
		} as unknown as Statement;
		seed([question(), top, option('a')], [vote('u1', 'a', 1)]);

		const result = await buildPrivacyExport({ statementId: Q });

		expect(result.metadata.stakeholderCount).toBe(40);
		expect(result.metadata.fpcApplied).toBe(true);
	});

	it('keeps a hidden option and flags it', async () => {
		seed([question(), option('a'), option('h', { hide: true })], [vote('u1', 'h', 1)]);

		const result = await buildPrivacyExport({ statementId: Q });

		expect(byId(result.optionEvaluations, 'h').hide).toBe(true);
		expect(byId(result.optionEvaluations, 'a').hide).toBe(false);
	});
});

describe('buildPrivacyExport — derived options', () => {
	const synth = option('s', {
		isCluster: true,
		derivedByPipeline: 'synthesis',
		integratedOptions: ['m1', 'm2'],
	});
	const evaluations = [
		// u1 votes on both members: counted once, as their average.
		vote('u1', 'm1', 1),
		vote('u1', 'm2', 0),
		// u2 votes directly on the synthesis AND a member: the direct vote wins.
		vote('u2', 's', -1),
		vote('u2', 'm1', 1),
		// u3 votes on one member only.
		vote('u3', 'm2', 0.5),
	];

	it('adds merged stats deduped per user, equal to the app aggregator', async () => {
		seed(
			[question(), synth, option('m1', { hide: true }), option('m2', { hide: true })],
			evaluations,
		);

		const result = await buildPrivacyExport({ statementId: Q });
		const s = byId(result.optionEvaluations, 's');
		const { evaluation } = computeClusterEvaluationFromRawEvals(evaluations, {
			clusterStatementId: 's',
		});

		expect(s.statsMethod).toBe('direct+merged');
		// Direct fields stay direct: only u2 voted on the synthesis itself.
		expect(s.totalEvaluators).toBe(1);
		expect(s.mergedTotalEvaluators).toBe(3);
		expect(s.mergedTotalEvaluators).toBe(evaluation.numberOfEvaluators);
		expect(s.mergedSumEvaluations).toBeCloseTo(0.5 + -1 + 0.5, 10);
		expect(s.mergedSumEvaluations).toBeCloseTo(evaluation.sumEvaluations, 10);
		expect(s.mergedAverageEvaluation).toBeCloseTo(evaluation.averageEvaluation ?? 0, 10);
		expect(s.mergedProCount).toBe(2);
		expect(s.mergedConCount).toBe(1);
		expect(s.mergedNeutralCount).toBe(0);
		expect(s.mergedAgreement).toBeCloseTo(evaluation.agreement ?? 0, 10);
		expect(s.mergedAgreementIndex).toBeCloseTo(evaluation.agreementIndex ?? 0, 10);
		expect(result.statsNotes).toMatch(/one vote per user/);
	});

	it('fetches votes of an absorbed cluster that lives under another question', async () => {
		const absorber = option('s', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: ['m1'],
			absorbedClusterIds: ['elsewhere'],
		});
		seed(
			[question(), absorber, option('m1')],
			[vote('u1', 'm1', 1), vote('u9', 'elsewhere', -1, 'other-question')],
		);

		const result = await buildPrivacyExport({ statementId: Q });
		const s = byId(result.optionEvaluations, 's');

		expect(s.mergedTotalEvaluators).toBe(2);
		expect(s.mergedConCount).toBe(1);
		// The outside vote feeds merged stats only, never the anonymized rows.
		expect(result.anonymizedEvaluations?.map((e) => e.statementId)).toEqual(['m1']);
	});
});

describe('buildPrivacyExport — empty themes', () => {
	it('skips memberless themes, hidden or not, and counts them', async () => {
		const emptyVisible = option('t-empty', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			integratedOptions: [],
		});
		const emptyHidden = option('t-hidden', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			integratedOptions: [],
			hide: true,
			hiddenReason: 'empty-theme',
		});
		const manual = option('t-manual', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			integratedOptions: [],
			titleLockedByCreator: true,
		});
		seed([question(), option('a'), emptyVisible, emptyHidden, manual], [vote('u1', 't-empty', 1)]);

		const result = await buildPrivacyExport({ statementId: Q });
		const ids = result.optionEvaluations.map((o) => o.statementId);

		expect(ids).toEqual(['a', 't-manual']);
		expect(result.metadata.skippedEmptyThemes).toBe(2);
		expect(result.metadata.totalRecords).toBe(2);
		expect(result.demographicBreakdowns.map((b) => b.option.statementId)).toEqual(ids);
		expect(result.anonymizedEvaluations).toEqual([]);
	});
});

describe('buildPrivacyExport — anonymized evaluations', () => {
	it('shuffles rows so a person’s votes no longer form one run', async () => {
		const users: [string, number][] = [
			['u1', 1],
			['u2', -1],
			['u3', 0.5],
		];
		const options = Array.from({ length: 10 }, (_, i) => option(`o${i}`));
		// Doc-id order: every user's votes are contiguous (3 runs).
		const evaluations = users.flatMap(([uid, value]) =>
			options.map((o) => vote(uid, o.statementId, value)),
		);
		seed([question(), ...options], evaluations);

		const result = await buildPrivacyExport({ statementId: Q });
		const rows = result.anonymizedEvaluations ?? [];
		const values = rows.map((r) => r.evaluationValue);

		expect(rows).toHaveLength(30);
		expect([...values].sort()).toEqual(evaluations.map((e) => e.evaluation).sort());
		expect(values).not.toEqual(evaluations.map((e) => e.evaluation));
		// Random order of 3×10 gives ~20 runs; an id-ordered leak gives 3.
		expect(runCount(values)).toBeGreaterThan(8);
		expect(result.privacyNotice).toMatch(/random order/);
	});
});
