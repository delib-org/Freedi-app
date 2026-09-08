import { describe, it, expect } from 'vitest';
import { parseQuestionRef } from '../questionRef';

const STATEMENT = 'aB3-xY9kLm2p';
const AUTO_ID = 'Xk29ZmQ4pLv7RtN1sWbC';
const SURVEY = 'survey_1712345678901_a1b2c3d';

describe('parseQuestionRef', () => {
	describe('bare ids', () => {
		it('reads a statement id', () => {
			expect(parseQuestionRef(STATEMENT)).toEqual({ kind: 'statement', id: STATEMENT });
		});

		it('reads a Firestore auto-id', () => {
			expect(parseQuestionRef(AUTO_ID)).toEqual({ kind: 'statement', id: AUTO_ID });
		});

		it('recognises a survey id by its prefix', () => {
			expect(parseQuestionRef(SURVEY)).toEqual({ kind: 'survey', id: SURVEY });
		});

		it('trims surrounding whitespace', () => {
			expect(parseQuestionRef(`  ${STATEMENT}  `)).toEqual({ kind: 'statement', id: STATEMENT });
		});

		it('rejects something too short to be an id', () => {
			expect(parseQuestionRef('abc')).toBeNull();
		});

		it('rejects an empty string', () => {
			expect(parseQuestionRef('   ')).toBeNull();
		});
	});

	describe('main app URLs', () => {
		it.each([
			[`https://app.wizcol.com/statement/${STATEMENT}`],
			[`https://app.wizcol.com/statement/${STATEMENT}/consensus`],
			[`https://app.wizcol.com/statement-screen/${STATEMENT}/settings`],
			[`https://app.wizcol.com/stage/${STATEMENT}`],
			[`https://app.wizcol.com/map/${STATEMENT}/embed`],
			[`https://app.wizcol.com/events/${STATEMENT}`],
		])('reads the statement out of %s', (url) => {
			expect(parseQuestionRef(url)).toEqual({ kind: 'statement', id: STATEMENT });
		});
	});

	describe('Mass-Consensus URLs', () => {
		it('reads a question link', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/q/${STATEMENT}`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it('reads a question results link', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/q/${STATEMENT}/results`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it('reads a survey link as a SURVEY, not a statement', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/s/${SURVEY}`)).toEqual({
				kind: 'survey',
				id: SURVEY,
			});
		});

		it('reads the survey admin link', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/admin/surveys/${SURVEY}`)).toEqual({
				kind: 'survey',
				id: SURVEY,
			});
		});

		it('does not mistake the numeric step of /s/<id>/q/<index> for an id', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/s/${SURVEY}/q/3`)).toEqual({
				kind: 'survey',
				id: SURVEY,
			});
		});

		it('reads the questionId out of the new-survey query string', () => {
			expect(
				parseQuestionRef(
					`https://mc.wizcol.com/admin/surveys/new?questionId=${STATEMENT}&returnTo=%2Forgs`,
				),
			).toEqual({ kind: 'statement', id: STATEMENT });
		});

		it('treats a bare /s/<id> as a survey even without the survey_ prefix', () => {
			expect(parseQuestionRef(`/s/${AUTO_ID}`)).toEqual({ kind: 'survey', id: AUTO_ID });
		});
	});

	describe('Join URLs', () => {
		it('takes the deepest statement from a nested join link', () => {
			const option = 'optionId1234';
			expect(
				parseQuestionRef(`https://wizcol-join.web.app/m/topId1234567/q/${STATEMENT}/s/${option}`),
			).toEqual({ kind: 'statement', id: option });
		});

		it('reads a hub link', () => {
			expect(parseQuestionRef(`https://wizcol-join.web.app/m/${STATEMENT}`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});
	});

	describe('Sign and Studio URLs', () => {
		it('reads a Sign document link', () => {
			expect(parseQuestionRef(`https://sign.wizcol.com/doc/${STATEMENT}`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it('reads a Sign admin editor link', () => {
			expect(parseQuestionRef(`https://sign.wizcol.com/doc/${STATEMENT}/admin/editor`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it("reads Studio's own question link, not the org id", () => {
			expect(
				parseQuestionRef(`https://wizcol-studio.web.app/orgs/orgAbc123456/questions/${STATEMENT}`),
			).toEqual({ kind: 'statement', id: STATEMENT });
		});

		it('takes the activity from a Studio run link', () => {
			const activity = 'activityId123';
			expect(parseQuestionRef(`/orgs/orgAbc123456/questions/${STATEMENT}/run/${activity}`)).toEqual(
				{ kind: 'statement', id: activity },
			);
		});
	});

	describe('awkward input', () => {
		it('ignores a trailing slash', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/q/${STATEMENT}/`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it('ignores a fragment', () => {
			expect(parseQuestionRef(`https://mc.wizcol.com/q/${STATEMENT}#top`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it('handles a path with no origin', () => {
			expect(parseQuestionRef(`/statement/${STATEMENT}`)).toEqual({
				kind: 'statement',
				id: STATEMENT,
			});
		});

		it('returns null for a URL carrying no id at all', () => {
			expect(parseQuestionRef('https://mc.wizcol.com/admin/surveys/new')).toBeNull();
		});

		it('returns null for prose', () => {
			expect(parseQuestionRef('please add the budget question')).toBeNull();
		});
	});
});
