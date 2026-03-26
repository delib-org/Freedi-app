const MAIN_APP_BASE = 'https://freedi.io';

export function getMainAppUrl(statementId: string, topParentId?: string): string {
	const topId = topParentId || statementId;
	return `${MAIN_APP_BASE}/statement/${topId}/chat?statement=${statementId}`;
}
