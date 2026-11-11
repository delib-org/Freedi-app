import { Statement, StatementType } from '@freedi/shared-types';
import { runSinglePipeline } from '../runSinglePipeline';

const HELD_MARK = { reason: 'inappropriate-language', hiddenAt: 1, eventId: 'e' };

function option(fields: object): Statement {
	return {
		statementId: 'answer-1',
		statementType: StatementType.option,
		statement: 'text',
		...fields,
	} as unknown as Statement;
}

async function reasonFor(fields: object): Promise<string | undefined> {
	const result = await runSinglePipeline({
		optionId: 'answer-1',
		option: option({ parentId: 'top', ...fields }),
	} as Parameters<typeof runSinglePipeline>[0]);

	return result.reason;
}

describe('runSinglePipeline and the automatic check', () => {
	it('skips a flagged answer before any AI work', async () => {
		const result = await runSinglePipeline({
			optionId: 'answer-1',
			option: option({ hide: true, parentId: 'q', answerModeration: HELD_MARK }),
		} as Parameters<typeof runSinglePipeline>[0]);

		expect(result).toMatchObject({
			action: 'skipped',
			reason: 'held-by-moderation',
			llmCalled: false,
		});
	});

	it('lets a restored answer past this guard', async () => {
		await expect(
			reasonFor({ hide: false, answerModeration: { ...HELD_MARK, restoredAt: 2 } }),
		).resolves.toBe('no-parent');
	});
});
