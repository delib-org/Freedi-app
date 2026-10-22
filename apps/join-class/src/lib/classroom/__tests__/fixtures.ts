import { StatementType, createStatementObject } from '@freedi/shared-types';
import type { ClassTableMarker, Statement } from '@freedi/shared-types';

/** A table answer by `by` under `parentId`, built the way the app builds statements. */
export function answerFixture(
	by: string,
	marker: Partial<ClassTableMarker> = {},
	parentId = 'q1',
): Statement {
	const creator = { uid: by, displayName: by, email: '', photoURL: '' };
	const statement = createStatementObject({
		statement: `by ${by}`,
		statementType: StatementType.option,
		parentId,
		topParentId: 'm',
		creatorId: by,
		creator,
	});
	if (!statement) throw new Error('fixture: statement not created');

	return {
		...statement,
		statementId: `a-${by}`,
		createdAt: 1,
		classTable: { tableId: 'm--3', shared: false, coAuthors: [], ...marker },
	};
}
