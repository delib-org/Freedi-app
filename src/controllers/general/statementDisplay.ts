import { Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

export const statementTitleToDisplay = (statement: string, titleLength: number) => {
	const _title = statement.split('\n')[0].replace(/\*/g, '') || statement.replace(/\*/g, '');

	const titleToSet =
		_title.length > titleLength - 3 ? _title.substring(0, titleLength) + '...' : _title;

	return { shortVersion: titleToSet, fullVersion: _title };
};

export function getTitle(statement: Statement | undefined) {
	try {
		if (!statement) return '';

		const title = statement.statement.split('\n')[0].replace(/\*/g, '');

		return title;
	} catch (error) {
		logError(error, { operation: 'general.helpers.getTitle' });

		return '';
	}
}

export function getDescription(statement: Statement) {
	try {
		if (!statement) throw new Error('No statement');

		const description = statement.statement.split('\n').slice(1).join('\n');

		return description;
	} catch (error) {
		logError(error, { operation: 'general.helpers.getDescription' });

		return '';
	}
}

export function getSetTimerId(statementId: string, order: number) {
	return `${statementId}--${order}`;
}

export function getRoomTimerId(statementId: string, roomNumber: number, order: number) {
	return `${statementId}--${roomNumber}--${order}`;
}

export function getStatementSubscriptionId(
	statementId: string,
	userId: string,
): string | undefined {
	try {
		if (!statementId) throw new Error('No statementId');

		return `${userId}--${statementId}`;
	} catch (error) {
		logError(error, { operation: 'general.helpers.getStatementSubscriptionId' });

		return undefined;
	}
}

export function getLatestUpdateStatements(statements: Statement[]): number {
	if (!statements || statements.length === 0) {
		return 0;
	}

	return statements.reduce(
		(latestUpdate, statement) =>
			statement.lastUpdate > latestUpdate ? statement.lastUpdate : latestUpdate,
		0,
	);
}
