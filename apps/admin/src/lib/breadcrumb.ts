import { StatementType } from '@freedi/shared-types';
import { fetchStatementById } from './queries';
import { getCached, setCache } from './cache';

export interface BreadcrumbItem {
	statementId: string;
	title: string;
	statementType: StatementType;
}

const MAX_DEPTH = 10;

export async function buildBreadcrumb(statementId: string): Promise<BreadcrumbItem[]> {
	const trail: BreadcrumbItem[] = [];
	let currentId: string | undefined = statementId;
	let depth = 0;

	while (currentId && currentId !== 'top' && depth < MAX_DEPTH) {
		let statement = getCached(currentId);

		if (!statement) {
			statement = await fetchStatementById(currentId);
			if (statement) {
				setCache(currentId, statement);
			}
		}

		if (!statement) break;

		trail.unshift({
			statementId: statement.statementId,
			title: statement.statement.length > 60
				? statement.statement.substring(0, 57) + '...'
				: statement.statement,
			statementType: statement.statementType,
		});

		if (currentId === statement.topParentId || statement.parentId === 'top') {
			break;
		}

		currentId = statement.parentId;
		depth++;
	}

	return trail;
}
