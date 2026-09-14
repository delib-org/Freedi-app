import {
	CovenantAction,
	CovenantRecord,
	CovenantClause,
	covenantReadiness,
} from '../../../packages/shared-types/src/models/covenant/covenant';

export class CovenantFailure extends Error {
	constructor(
		public readonly code:
			| 'permission-denied'
			| 'failed-precondition'
			| 'invalid-argument'
			| 'resource-exhausted',
		message: string,
	) {
		super(message);
	}
}
function requireCondition(condition: unknown, message: string): asserts condition {
	if (!condition) throw new CovenantFailure('failed-precondition', message);
}
function text(value: unknown, max = 1500): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
		throw new CovenantFailure('invalid-argument', `Text must contain 1–${max} characters.`);

	return value.trim();
}
export function applyCovenantAction(
	current: CovenantRecord,
	action: CovenantAction,
	context: {
		uid: string;
		manager: boolean;
		now: number;
		id: string;
		source?: CovenantClause;
		eligibleIds: string[];
	},
): CovenantRecord {
	const state = JSON.parse(JSON.stringify(current)) as CovenantRecord;
	const { uid, manager, now, id } = context;
	const manage = (): void => {
		if (!manager)
			throw new CovenantFailure('permission-denied', 'Only a facilitator can perform this action.');
	};
	const draft = (): void => {
		requireCondition(state.phase === 'draft', 'Reopen drafting before changing the document.');
	};
	const clause = (clauseId: string): CovenantClause => {
		const found = state.clauses.find((c) => c.id === clauseId);
		requireCondition(found, 'This clause is no longer in the draft.');

		return found;
	};
	const note = (
		clauseId: string,
		message: string,
		proposedText = '',
		status: 'open' | 'accepted' = 'open',
	): void => {
		requireCondition(
			state.notes.length < 200,
			'The note limit has been reached. Export the discussion before continuing.',
		);
		state.notes.push({
			id,
			clauseId,
			authorId: uid,
			text: message,
			proposedText,
			createdAt: now,
			status,
		});
	};
	const latest = state.reviews[state.reviews.length - 1];
	switch (action.type) {
		case 'title':
			manage();
			draft();
			state.title = text(action.text, 200);
			break;
		case 'add-clause':
			manage();
			draft();
			requireCondition(context.source, 'Source solution is unavailable.');
			requireCondition(state.clauses.length < 40, 'A covenant can contain at most 40 clauses.');
			requireCondition(
				!state.clauses.some((c) => c.sourceId === context.source?.sourceId),
				'This solution is already included.',
			);
			state.clauses.push({
				...context.source,
				text: text(context.source.text),
				sourceText: text(context.source.sourceText),
			});
			break;
		case 'amend': {
			manage();
			draft();
			const item = clause(action.clauseId);
			note(item.id, `${text(action.reason)}\nPrevious wording: ${item.text}`, '', 'accepted');
			item.text = text(action.text);
			break;
		}
		case 'remove-clause': {
			manage();
			draft();
			const item = clause(action.clauseId);
			note(item.id, `${text(action.reason)}\nRemoved wording: ${item.text}`, '', 'accepted');
			state.clauses = state.clauses.filter((c) => c.id !== item.id);
			break;
		}
		case 'note':
			requireCondition(state.phase !== 'adopted', 'Reopen drafting to add a new suggestion.');
			clause(action.clauseId);
			note(
				action.clauseId,
				text(action.text),
				action.proposedText ? text(action.proposedText) : '',
			);
			break;
		case 'accept-note': {
			manage();
			draft();
			const item = state.notes.find((n) => n.id === action.noteId);
			requireCondition(
				item && item.status === 'open' && item.proposedText,
				'There is no open amendment to accept.',
			);
			const target = clause(item.clauseId);
			note(
				target.id,
				`Accepted suggested wording. Previous wording: ${target.text}`,
				'',
				'accepted',
			);
			target.text = item.proposedText;
			item.status = 'accepted';
			break;
		}
		case 'withdraw-note': {
			const item = state.notes.find((n) => n.id === action.noteId);
			requireCondition(
				item && item.authorId === uid && item.status === 'open',
				'Only the author can withdraw their open note.',
			);
			item.status = 'withdrawn';
			break;
		}
		case 'open-review': {
			manage();
			draft();
			requireCondition(state.clauses.length, 'Add at least one clause before review.');
			requireCondition(
				Array.isArray(action.reviewerIds) &&
					action.reviewerIds.length > 0 &&
					action.reviewerIds.length <= 500,
				'Select between 1 and 500 reviewers.',
			);
			requireCondition(
				new Set(action.reviewerIds).size === action.reviewerIds.length,
				'Reviewers must be unique.',
			);
			requireCondition(
				action.reviewerIds.every((reviewer) => context.eligibleIds.includes(reviewer)),
				'Every reviewer must be an active member.',
			);
			requireCondition(
				Number.isInteger(action.threshold) && action.threshold >= 51 && action.threshold <= 100,
				'Endorsement threshold must be between 51 and 100 percent.',
			);
			requireCondition(
				(latest?.version || 0) < 100,
				'Review limit reached. Export the review history.',
			);
			state.reviews.push({
				version: (latest?.version || 0) + 1,
				title: state.title,
				clauses: JSON.parse(JSON.stringify(state.clauses)),
				reviewerIds: [...action.reviewerIds],
				threshold: action.threshold,
				positions: {},
				openedAt: now,
			});
			state.phase = 'review';
			break;
		}
		case 'position':
			requireCondition(
				state.phase === 'review' && latest?.version === action.version,
				'This review version is no longer open.',
			);
			requireCondition(
				latest.reviewerIds.includes(uid),
				'You are not in this version’s review group.',
			);
			requireCondition(
				['endorse', 'no-objection', 'object'].includes(action.position),
				'Choose a valid position.',
			);
			latest.positions = {
				...latest.positions,
				[uid]: {
					position: action.position,
					reason:
						action.position === 'object'
							? text(action.reason)
							: action.reason
								? text(action.reason)
								: '',
					at: now,
				},
			};
			break;
		case 'reopen':
			manage();
			requireCondition(state.phase !== 'draft', 'Drafting is already open.');
			state.phase = 'draft';
			break;
		case 'adopt':
			manage();
			requireCondition(
				state.phase === 'review' && latest?.version === action.version,
				'This review version is no longer open.',
			);
			requireCondition(
				covenantReadiness(latest).ready,
				'Adoption needs sufficient endorsements, no objections and a response from every reviewer.',
			);
			latest.adoptedAt = now;
			latest.adoptedBy = uid;
			state.phase = 'adopted';
			break;
		default:
			throw new CovenantFailure('invalid-argument', 'Unknown covenant action.');
	}
	state.revision++;
	state.updatedAt = now;

	return state;
}
