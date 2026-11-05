import type { TableAssignmentMode, TableAssignmentStatus } from '@freedi/shared-types';

/**
 * The one next action the host home offers (IA: "לדעת מה הפעולה הבאה").
 * `kind: 'go'` opens a sub-screen, `kind: 'status'` calls tablesSetStatus.
 */
export type NextAction =
	| { key: 'addTopics'; kind: 'go'; screen: 'topics' }
	| { key: 'openRegistration'; kind: 'status'; status: 'registrationOpen' }
	| { key: 'closeRegistration'; kind: 'status'; status: 'registrationClosed' }
	| { key: 'preview'; kind: 'go'; screen: 'preview' }
	| { key: 'endSession'; kind: 'status'; status: 'ended' }
	| { key: 'viewAssignment'; kind: 'go'; screen: 'assignment' }
	| { key: 'done'; kind: 'none' };

export interface NextActionInput {
	status: TableAssignmentStatus;
	mode: TableAssignmentMode;
	topicCount: number;
}

/**
 * draft -> add topics -> open registration -> close -> preview and publish
 * (ranked) or end (direct, where seats are taken live) -> view the result.
 */
export function nextHostAction({ status, mode, topicCount }: NextActionInput): NextAction {
	switch (status) {
		case 'draft':
			return topicCount === 0
				? { key: 'addTopics', kind: 'go', screen: 'topics' }
				: { key: 'openRegistration', kind: 'status', status: 'registrationOpen' };
		case 'registrationOpen':
			return { key: 'closeRegistration', kind: 'status', status: 'registrationClosed' };
		case 'registrationClosed':
			return mode === 'ranked'
				? { key: 'preview', kind: 'go', screen: 'preview' }
				: { key: 'endSession', kind: 'status', status: 'ended' };
		case 'published':
			return { key: 'viewAssignment', kind: 'go', screen: 'assignment' };
		case 'ended':
		default:
			return { key: 'done', kind: 'none' };
	}
}

/** Topics and settings can change until registration opens; locked afterwards (topic list is frozen). */
export function canEditTopics(status: TableAssignmentStatus): boolean {
	return status === 'draft';
}

/** A participant may save preferences only while registration is open. */
export function canEditPreferences(status: TableAssignmentStatus): boolean {
	return status === 'registrationOpen';
}

/** The status controls the participants screen shows for the current status. */
export function statusControls(
	status: TableAssignmentStatus,
): Array<'registrationOpen' | 'registrationClosed' | 'ended'> {
	switch (status) {
		case 'draft':
			return ['registrationOpen'];
		case 'registrationOpen':
			return ['registrationClosed', 'ended'];
		case 'registrationClosed':
			return ['registrationOpen', 'ended'];
		case 'published':
			return ['ended'];
		case 'ended':
		default:
			return [];
	}
}
