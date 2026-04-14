import {
	object,
	string,
	number,
	boolean,
	optional,
	record,
	InferOutput,
} from 'valibot';

/**
 * JoinFormSubmission — a single user's response to the admin-defined
 * join form on a question. Stored once per user per owning question at:
 *   statements/{questionId}/joinFormSubmissions/{userId}
 *
 * The submission is reused across all join actions (activist/organizer,
 * any option) under the same question, so the modal only appears once.
 */
export const JoinFormSubmissionSchema = object({
	userId: string(),
	questionId: string(),
	displayName: string(),
	values: record(string(), string()), // { [fieldId]: value }
	createdAt: number(),
	lastUpdate: number(),
	syncedToSheet: optional(boolean()),
	syncedRange: optional(string()),
});

export type JoinFormSubmission = InferOutput<typeof JoinFormSubmissionSchema>;

export const JOIN_FORM_SUBMISSIONS_SUBCOLLECTION = 'joinFormSubmissions';
