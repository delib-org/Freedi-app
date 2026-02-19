import { Statement } from './StatementTypes';
import { SimpleStatement } from './SimpleStatement';

export function statementToSimpleStatement(
	statement: Statement
): SimpleStatement {
	const simple: SimpleStatement = {
		statementId: statement.statementId,
		statement: statement.statement,
		statementType: statement.statementType,
		paragraphs: statement.paragraphs ?? [],
		creatorId: statement.creatorId,
		creator: statement.creator,
		parentId: statement.parentId,
		// Use evaluation.agreement when available, fallback to consensus for legacy data
		consensus: statement.evaluation?.agreement ?? statement.consensus ?? 0,
		voted: statement.voted ?? 0,
		lastUpdate: statement.lastUpdate ?? 0,
		createdAt: statement.createdAt ?? 0
	};

	if (statement.imagesURL?.main) simple.imageURL = statement.imagesURL?.main;

	return simple;
}
