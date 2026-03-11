import { SourceApp } from './SourceApp';

/**
 * Deep link patterns for each app.
 * {statementId}, {parentId}, {processId}, etc. are replaced at runtime.
 */
export const APP_DEEP_LINKS: Record<SourceApp, Record<string, string>> = {
	[SourceApp.MAIN]: {
		statement: '/statement/{parentId}?focusId={statementId}',
		profile: '/user/{userId}',
		discussion: '/statement/{statementId}',
	},
	[SourceApp.SIGN]: {
		document: '/doc/{statementId}',
	},
	[SourceApp.MASS_CONSENSUS]: {
		process: '/swipe/{processId}',
		results: '/results/{processId}',
	},
	[SourceApp.FLOW]: {
		step: '/flow/{flowId}/step/{stepId}',
	},
};

/**
 * Build a deep link URL by replacing template variables with actual values.
 */
export function buildDeepLink(
	sourceApp: SourceApp,
	pathTemplate: string,
	params: Record<string, string>
): string {
	let path = pathTemplate;
	for (const [key, value] of Object.entries(params)) {
		path = path.replace(`{${key}}`, value);
	}

	return path;
}
