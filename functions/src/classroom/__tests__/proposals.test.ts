import {
	CLASS_LANGUAGE_FLAGS_COLLECTION,
	CLASS_LANGUAGE_FLAGS_KEPT,
	CLASS_LANGUAGE_FLAG_TTL_DAYS,
	CLASS_PROPOSAL_MAX_LENGTH,
} from '@freedi/shared-types';
import { postProposal } from '../fn_classPostProposal';
import type { PostProposalDeps } from '../fn_classPostProposal';
import { editProposal } from '../fn_classEditProposal';
import { postReply } from '../fn_classPostReply';
import { buildLanguageFlag, planFlagWrite } from '../languageFlags';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TEACHER = 'teacher';
const STUDENT = 'dana';
const MATE = 'noa';
const NOW = 2_000_000;
const DAY = 24 * 60 * 60 * 1000;

function member(fake: FakeFirestore, uid: string, name: string, extra = {}): void {
	fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
		userId: uid,
		statementId: MAIN,
		role: uid === TEACHER ? 'admin' : 'member',
		user: { uid, displayName: name, isAnonymous: true },
		...extra,
	});
}

function seedLesson(ballot = false): FakeFirestore {
	const fake = new FakeFirestore();
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		statement: 'Lesson',
		parentId: 'top',
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'Ms Teacher' },
		statementSettings: { lessonPlan: { steps: ['proposals'], stepIndex: 0 } },
	});
	member(fake, TEACHER, 'Ms Teacher');
	member(fake, STUDENT, 'Dana', { tableId: `${MAIN}--2` });
	member(fake, MATE, 'Noa');
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		statementSettings: {
			classRole: 'challenge',
			...(ballot ? { ballot: { candidateIds: ['x'], frozenAt: 1 } } : {}),
		},
	});

	return fake;
}

function deps(flagged = false): PostProposalDeps {
	return { detect: async () => flagged, now: () => NOW };
}

function failing(): PostProposalDeps {
	// containsBadLanguage fails open: a broken detector answers "fine", never throws.
	return { detect: async () => false, now: () => NOW };
}

function flags(fake: FakeFirestore): Record<string, unknown>[] {
	return fake.list(CLASS_LANGUAGE_FLAGS_COLLECTION);
}

describe('classPostProposal', () => {
	it('writes the proposal like the phone did, with the table marker', async () => {
		const fake = seedLesson();
		const res = await postProposal(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', text: '  Plant trees  ' },
			deps(),
		);
		expect(res).toEqual({ ok: true, proposalId: 'p1' });
		expect(fake.read('statements/p1')).toMatchObject({
			statement: 'Plant trees',
			statementType: 'option',
			parentId: 'ch',
			topParentId: MAIN,
			creatorId: STUDENT,
			creator: { displayName: 'Dana' },
			createdAt: NOW,
			classTable: { tableId: `${MAIN}--2`, shared: false, coAuthors: [] },
		});
		expect(flags(fake)).toHaveLength(0);
	});

	it('refuses hurtful words: nothing is published, the teacher is flagged', async () => {
		const fake = seedLesson();
		const res = await postProposal(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', text: 'you idiots' },
			deps(true),
		);
		expect(res).toEqual({ ok: false, reason: 'language' });
		expect(fake.read('statements/p1')).toBeUndefined();
		expect(flags(fake)).toHaveLength(1);
		expect(flags(fake)[0]).toMatchObject({
			mainId: MAIN,
			uid: STUDENT,
			kind: 'proposal',
			text: 'you idiots',
			attempt: 1,
			createdAt: NOW,
			expireAt: NOW + CLASS_LANGUAGE_FLAG_TTL_DAYS * DAY,
		});
	});

	it('passes the text when the detector is down (it fails open)', async () => {
		const fake = seedLesson();
		const res = await postProposal(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', text: 'Plant trees' },
			failing(),
		);
		expect(res.ok).toBe(true);
		expect(flags(fake)).toHaveLength(0);
	});

	it('does not check the teacher', async () => {
		const fake = seedLesson();
		const res = await postProposal(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, proposalId: 'pt', text: 'A teacher idea' },
			deps(true),
		);
		expect(res.ok).toBe(true);
		expect(flags(fake)).toHaveLength(0);
	});

	it('is safe to repeat with the same id, and refuses a second different proposal', async () => {
		const fake = seedLesson();
		const request = { mainId: MAIN, proposalId: 'p1', text: 'Plant trees' };
		await postProposal(fake.asFirestore(), STUDENT, request, deps());
		await expect(postProposal(fake.asFirestore(), STUDENT, request, deps())).resolves.toEqual({
			ok: true,
			proposalId: 'p1',
		});
		await expect(
			postProposal(fake.asFirestore(), STUDENT, { ...request, proposalId: 'p2' }, deps()),
		).rejects.toMatchObject({ reason: 'already-proposed' });
	});

	it('refuses a stranger, an empty text, a long text and an open vote', async () => {
		const fake = seedLesson();
		const base = { mainId: MAIN, proposalId: 'p1', text: 'ok' };
		await expect(postProposal(fake.asFirestore(), 'nobody', base, deps())).rejects.toMatchObject({
			code: 'permission-denied',
		});
		await expect(
			postProposal(fake.asFirestore(), STUDENT, { ...base, text: '   ' }, deps()),
		).rejects.toMatchObject({ code: 'invalid-argument' });
		await expect(
			postProposal(
				fake.asFirestore(),
				STUDENT,
				{ ...base, text: 'x'.repeat(CLASS_PROPOSAL_MAX_LENGTH + 1) },
				deps(),
			),
		).rejects.toMatchObject({ reason: 'proposal-too-long' });
		await expect(
			postProposal(seedLesson(true).asFirestore(), STUDENT, base, deps()),
		).rejects.toMatchObject({ reason: 'vote-running' });
	});
});

describe('classEditProposal', () => {
	async function withProposal(): Promise<FakeFirestore> {
		const fake = seedLesson();
		await postProposal(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', text: 'Plant trees' },
			deps(),
		);

		return fake;
	}

	it('changes the text of the writer own proposal', async () => {
		const fake = await withProposal();
		const res = await editProposal(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', text: 'Plant more trees' },
			{ detect: async () => false, now: () => NOW + 5 },
		);
		expect(res).toEqual({ ok: true, proposalId: 'p1' });
		expect(fake.read('statements/p1')).toMatchObject({
			statement: 'Plant more trees',
			lastUpdate: NOW + 5,
		});
	});

	it('refused words keep the old text and flag the teacher with the proposal id', async () => {
		const fake = await withProposal();
		const res = await editProposal(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', text: 'idiots' },
			deps(true),
		);
		expect(res).toEqual({ ok: false, reason: 'language' });
		expect(fake.read('statements/p1')).toMatchObject({ statement: 'Plant trees' });
		expect(flags(fake)[0]).toMatchObject({ kind: 'proposal', targetId: 'p1', text: 'idiots' });
	});

	it("refuses someone else's proposal and an open vote", async () => {
		const fake = await withProposal();
		const request = { mainId: MAIN, proposalId: 'p1', text: 'mine now' };
		await expect(editProposal(fake.asFirestore(), MATE, request, deps())).rejects.toMatchObject({
			code: 'permission-denied',
		});
		fake.seed('statements/ch', {
			statementId: 'ch',
			parentId: MAIN,
			statementType: 'question',
			statementSettings: { classRole: 'challenge', ballot: { candidateIds: ['p1'], frozenAt: 1 } },
		});
		await expect(editProposal(fake.asFirestore(), STUDENT, request, deps())).rejects.toMatchObject({
			reason: 'vote-running',
		});
	});
});

describe('a refused reply flags the teacher', () => {
	it('writes a reply flag with the proposal id and no publication', async () => {
		const fake = seedLesson();
		fake.seed('statements/p1', {
			statementId: 'p1',
			statement: 'Plant trees',
			parentId: 'ch',
			topParentId: MAIN,
			parents: [MAIN, 'ch'],
			statementType: 'option',
			creatorId: MATE,
		});
		const res = await postReply(
			fake.asFirestore(),
			STUDENT,
			{ mainId: MAIN, proposalId: 'p1', replyId: 'r1', text: 'idiots' },
			{ detect: async () => true, now: () => NOW },
		);
		expect(res).toEqual({ ok: false, reason: 'language' });
		expect(fake.read('statements/r1')).toBeUndefined();
		expect(flags(fake)[0]).toMatchObject({ kind: 'reply', targetId: 'p1', uid: STUDENT });
	});
});

describe('language flags: only the last three texts are kept', () => {
	it('numbers the attempts and trims the oldest beyond three', async () => {
		const fake = seedLesson();
		const attempts = ['one', 'two', 'three', 'four', 'five'];
		for (const [i, text] of attempts.entries()) {
			await postProposal(
				fake.asFirestore(),
				STUDENT,
				{ mainId: MAIN, proposalId: `p${i}`, text },
				{ detect: async () => true, now: () => NOW + i },
			);
		}
		const kept = flags(fake);
		expect(kept).toHaveLength(CLASS_LANGUAGE_FLAGS_KEPT);
		expect(kept.map((f) => f.text).sort()).toEqual(['five', 'four', 'three']);
		expect(Math.max(...kept.map((f) => f.attempt as number))).toBe(5);
	});

	it("keeps another student's flags apart", async () => {
		const fake = seedLesson();
		for (const uid of [STUDENT, MATE]) {
			await postProposal(
				fake.asFirestore(),
				uid,
				{ mainId: MAIN, proposalId: `p-${uid}`, text: 'bad' },
				{ detect: async () => true, now: () => NOW },
			);
		}
		expect(flags(fake)).toHaveLength(2);
	});

	it('plans the trim purely: newest kept, oldest deleted, attempt counted up', () => {
		const existing = [
			{ flagId: 'a', createdAt: 1, attempt: 1 },
			{ flagId: 'b', createdAt: 2, attempt: 2 },
			{ flagId: 'c', createdAt: 3, attempt: 3 },
		];
		expect(planFlagWrite(existing)).toEqual({ attempt: 4, deleteIds: ['a'] });
		expect(planFlagWrite(existing.slice(0, 1))).toEqual({ attempt: 2, deleteIds: [] });
		expect(planFlagWrite([])).toEqual({ attempt: 1, deleteIds: [] });
	});

	it('caps the stored text at the item maximum', () => {
		const flag = buildLanguageFlag(
			{ mainId: MAIN, uid: STUDENT, kind: 'reply', text: 'x'.repeat(50), maxLength: 10, now: NOW },
			'f1',
			1,
		);
		expect(flag.text).toHaveLength(10);
		expect(flag.targetId).toBeUndefined();
	});
});
