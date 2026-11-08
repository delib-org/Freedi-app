/**
 * Turning what a consultant pasted into something the board can add.
 *
 * They will paste whatever was in their address bar, and the apps disagree
 * about what sits in a URL: `/s/<surveyId>` and `/admin/surveys/<surveyId>`
 * carry a SURVEY, everything else carries a statement. A survey is not a
 * statement — it points at questions through `questionIds` — so the two have
 * to stay distinguishable all the way to the server, which resolves the
 * survey (clients cannot read the surveys collection at all).
 *
 * A bare id is ambiguous by shape except for surveys, whose ids are minted as
 * `survey_<ms>_<random>` by both writers.
 */

export type QuestionRefKind = 'statement' | 'survey';

export interface QuestionRef {
	kind: QuestionRefKind;
	id: string;
}

/** `survey_1712345678901_a1b2c3d` — see `generateSurveyId` in shared-types. */
const SURVEY_ID = /^survey_\d+_[a-z0-9]+$/i;

/** Statement ids are 12 chars of [A-Za-z0-9-] or a 20-char Firestore auto-id. */
const BARE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Path segments that introduce a statement id. `s` appears here for the join
 * app's `/q/<qid>/s/<optionId>`; a Mass-Consensus `/s/<surveyId>` is caught
 * earlier, by the survey rule, because there `s` is the FIRST segment.
 */
const STATEMENT_KEYS = new Set([
	'statement',
	'statement-screen',
	'stage',
	'map',
	'events',
	'q',
	'q-results',
	'm',
	's',
	'doc',
	'questions',
	'run',
]);

/** Segments that are never an id, however id-shaped they look. */
const NOT_AN_ID = new Set([
	'new',
	'admin',
	'results',
	'complete',
	'settings',
	'editor',
	'embed',
	'plan',
	'thank-you',
	'groups',
	'orgs',
	'surveys',
	'mind-map',
]);

function segments(input: string): string[] {
	const withoutQuery = input.split('?')[0].split('#')[0];

	return withoutQuery
		.replace(/^[a-z]+:\/\/[^/]+/i, '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
}

/** The `questionId=` / `parentStatementId=` on `/admin/surveys/new?...`. */
function fromQueryString(input: string): QuestionRef | null {
	const queryIndex = input.indexOf('?');
	if (queryIndex === -1) return null;
	const params = new URLSearchParams(input.slice(queryIndex + 1));
	for (const key of ['questionId', 'statementId', 'parentStatementId']) {
		const value = params.get(key);
		if (value && BARE_ID.test(value)) return { kind: 'statement', id: value };
	}

	return null;
}

/**
 * Reads a question or survey reference out of a pasted id or URL, or returns
 * null when there is nothing id-shaped in it.
 *
 * Where a URL names several statements — `/m/<top>/q/<question>/s/<option>` —
 * the DEEPEST one wins, on the same reasoning as the share-link renderer: it
 * is the screen the person was looking at when they copied the address.
 */
export function parseQuestionRef(input: string): QuestionRef | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (SURVEY_ID.test(trimmed)) return { kind: 'survey', id: trimmed };

	const parts = segments(trimmed);

	if (parts.length === 0) {
		return BARE_ID.test(trimmed) ? { kind: 'statement', id: trimmed } : null;
	}

	if (parts.length === 1 && !trimmed.includes('/')) {
		if (SURVEY_ID.test(parts[0])) return { kind: 'survey', id: parts[0] };

		return BARE_ID.test(parts[0]) ? { kind: 'statement', id: parts[0] } : null;
	}

	// A survey id anywhere in the path settles it, whatever key introduced it.
	const survey = parts.find((part) => SURVEY_ID.test(part));
	if (survey) return { kind: 'survey', id: survey };

	// `/s/<id>` at the start of the path is Mass-Consensus: that is a survey,
	// even when the id predates the `survey_` prefix.
	if (parts[0] === 's' && parts[1] && BARE_ID.test(parts[1])) {
		return { kind: 'survey', id: parts[1] };
	}
	const surveysIndex = parts.indexOf('surveys');
	if (surveysIndex !== -1) {
		const next = parts[surveysIndex + 1];
		if (next && !NOT_AN_ID.has(next) && BARE_ID.test(next)) {
			return { kind: 'survey', id: next };
		}

		return fromQueryString(trimmed);
	}

	// Deepest keyed segment wins.
	for (let i = parts.length - 2; i >= 0; i--) {
		const value = parts[i + 1];
		if (!STATEMENT_KEYS.has(parts[i])) continue;
		if (NOT_AN_ID.has(value) || !BARE_ID.test(value)) continue;

		return { kind: 'statement', id: value };
	}

	// No key we recognise — fall back to the last id-shaped segment.
	for (let i = parts.length - 1; i >= 0; i--) {
		const value = parts[i];
		if (NOT_AN_ID.has(value) || !BARE_ID.test(value)) continue;

		return { kind: 'statement', id: value };
	}

	return fromQueryString(trimmed);
}
