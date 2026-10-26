import type { Message } from 'firebase-admin/messaging';
import { CLASS_REPLY_MAX_LENGTH } from '@freedi/shared-types';
import type { ClassPostReplyRequest } from '@freedi/shared-types';
import { postReply } from '../fn_classPostReply';
import type { PostReplyDeps } from '../fn_classPostReply';
import { setItemHidden } from '../fn_classSetItemHidden';
import {
	REPLY_PUSH_MAX_PER_LESSON,
	REPLY_PUSH_MIN_GAP_MS,
	decideReplyPush,
	replyCountAfter,
	unreadForAuthor,
} from '../replyLogic';
import type { ReplyPushInput } from '../replyLogic';
import { buildReplyMessages, JOIN_CLASS_PUSH_APP } from '../replyPush';
import { replyPushBody, replyPushLanguageOf } from '../replyPushText';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TEACHER = 'teacher';
const AUTHOR = 'author';
const CLASSMATE = 'mate';
const STRANGER = 'stranger';
const PROPOSAL = 'p1';
const NOW = 1_000_000;

function member(fake: FakeFirestore, uid: string, name: string, role = 'member'): void {
	fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
		userId: uid,
		statementId: MAIN,
		role,
		user: { uid, displayName: name, isAnonymous: true },
	});
}

function seedLesson(status?: string): FakeFirestore {
	const fake = new FakeFirestore();
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		statement: 'Lesson title',
		parentId: 'top',
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'Ms Teacher' },
		statementSettings: {
			lessonPlan: { steps: ['proposals'], stepIndex: 0, ...(status ? { status } : {}) },
		},
	});
	member(fake, TEACHER, 'Ms Teacher', 'admin');
	member(fake, AUTHOR, 'Dana');
	member(fake, CLASSMATE, 'Noa');
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		statementSettings: { classRole: 'challenge' },
	});
	fake.seed('statements/g1', {
		statementId: 'g1',
		parentId: MAIN,
		statementType: 'question',
		statementSettings: { classRole: 'guiding' },
	});
	fake.seed(`statements/${PROPOSAL}`, {
		statementId: PROPOSAL,
		statement: 'Plant trees',
		parentId: 'ch',
		topParentId: MAIN,
		parents: [MAIN, 'ch'],
		statementType: 'option',
		creatorId: AUTHOR,
	});
	fake.seed('statements/answer', {
		statementId: 'answer',
		parentId: 'g1',
		topParentId: MAIN,
		statementType: 'option',
		creatorId: AUTHOR,
	});

	return fake;
}

function device(fake: FakeFirestore, token: string, uid = AUTHOR, app = JOIN_CLASS_PUSH_APP): void {
	fake.seed(`pushNotifications/${token}`, { token, userId: uid, app, language: 'en' });
}

interface Harness {
	deps: PostReplyDeps;
	sent: Message[][];
	clock: { now: number };
}

function harness(flagged = false, invalid: string[] = []): Harness {
	const sent: Message[][] = [];
	const clock = { now: NOW };

	return {
		sent,
		clock,
		deps: {
			detect: async () => flagged,
			send: async (messages) => {
				sent.push(messages);

				return invalid;
			},
			now: () => clock.now,
		},
	};
}

let seq = 0;
function req(text = 'Where would the trees go?', proposalId = PROPOSAL): ClassPostReplyRequest {
	seq += 1;

	return { mainId: MAIN, proposalId, replyId: `r${seq}`, text };
}

describe('classPostReply', () => {
	it('writes a classmate reply under the proposal and counts it', async () => {
		const fake = seedLesson();
		const h = harness();
		const request = req();
		const res = await postReply(fake.asFirestore(), CLASSMATE, request, h.deps);
		expect(res).toEqual({ ok: true, replyId: request.replyId });
		expect(fake.read(`statements/${request.replyId}`)).toMatchObject({
			statement: 'Where would the trees go?',
			statementType: 'statement',
			parentId: PROPOSAL,
			topParentId: MAIN,
			creatorId: CLASSMATE,
			creator: { displayName: 'Noa' },
			createdAt: NOW,
			classReply: { role: 'class', proposalCreatorId: AUTHOR },
		});
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyCount: 1, lastReplyAt: NOW });
	});

	it('tags the author and the teacher, and skips the language check for the teacher', async () => {
		const fake = seedLesson();
		const flagged = harness(true);
		const teacherReq = req('A teacher note');
		await postReply(fake.asFirestore(), TEACHER, teacherReq, flagged.deps);
		expect(fake.read(`statements/${teacherReq.replyId}`)).toMatchObject({
			classReply: { role: 'teacher' },
			creator: { displayName: 'Ms Teacher' },
		});
		const authorReq = req('Thanks, I will fix it');
		await postReply(fake.asFirestore(), AUTHOR, authorReq, harness().deps);
		expect(fake.read(`statements/${authorReq.replyId}`)).toMatchObject({
			classReply: { role: 'author' },
		});
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyCount: 2 });
	});

	it('refuses hurtful words: nothing written, the client keeps the text', async () => {
		const fake = seedLesson();
		const request = req('bad words');
		const res = await postReply(fake.asFirestore(), CLASSMATE, request, harness(true).deps);
		expect(res).toEqual({ ok: false, reason: 'language' });
		expect(fake.read(`statements/${request.replyId}`)).toBeUndefined();
		expect(fake.read(`statements/${PROPOSAL}`)?.replyCount).toBeUndefined();
	});

	it('refuses non-members, banned members, and paused lessons for students', async () => {
		const fake = seedLesson();
		member(fake, 'banned1', 'B', 'banned');
		const db = fake.asFirestore();
		const deps = harness().deps;
		await expect(postReply(db, STRANGER, req(), deps)).rejects.toMatchObject({
			code: 'permission-denied',
		});
		await expect(postReply(db, 'banned1', req(), deps)).rejects.toMatchObject({
			code: 'permission-denied',
		});

		const paused = seedLesson('paused');
		await expect(postReply(paused.asFirestore(), CLASSMATE, req(), deps)).rejects.toMatchObject({
			code: 'failed-precondition',
		});
		// the teacher may still reply while the lesson is paused, not once it ended
		await expect(postReply(paused.asFirestore(), TEACHER, req(), deps)).resolves.toMatchObject({
			ok: true,
		});
		const ended = seedLesson('ended');
		await expect(postReply(ended.asFirestore(), TEACHER, req(), deps)).rejects.toMatchObject({
			reason: 'lesson-ended',
		});
	});

	it('refuses empty and too-long text, and anything but a visible proposal', async () => {
		const fake = seedLesson();
		const db = fake.asFirestore();
		const deps = harness().deps;
		await expect(postReply(db, CLASSMATE, req('   '), deps)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		await expect(
			postReply(db, CLASSMATE, req('x'.repeat(CLASS_REPLY_MAX_LENGTH + 1)), deps),
		).rejects.toMatchObject({ reason: 'reply-too-long' });
		await expect(
			postReply(db, CLASSMATE, req('x'.repeat(CLASS_REPLY_MAX_LENGTH)), deps),
		).resolves.toMatchObject({ ok: true });
		await expect(postReply(db, CLASSMATE, req('hi', 'answer'), deps)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		await expect(postReply(db, CLASSMATE, req('hi', 'missing'), deps)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		fake.seed(`statements/${PROPOSAL}`, { ...fake.read(`statements/${PROPOSAL}`), hide: true });
		await expect(postReply(db, CLASSMATE, req(), deps)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('is safe to retry with the same replyId', async () => {
		const fake = seedLesson();
		const db = fake.asFirestore();
		const request = req();
		await postReply(db, CLASSMATE, request, harness().deps);
		await postReply(db, CLASSMATE, request, harness().deps);
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyCount: 1 });
	});

	it('pushes the author once per window, with no reply text or name in the body', async () => {
		const fake = seedLesson();
		device(fake, 'tok-a');
		device(fake, 'tok-main-app', AUTHOR, 'main');
		const db = fake.asFirestore();
		const h = harness();
		await postReply(db, CLASSMATE, req('Secret words'), h.deps);
		expect(h.sent).toHaveLength(1);
		expect(h.sent[0]).toHaveLength(1);
		const first = h.sent[0][0] as Message & { token: string; data: Record<string, string> };
		expect(first.token).toBe('tok-a');
		expect(first.data).toMatchObject({
			title: 'Lesson title',
			body: replyPushBody('en', 1),
			url: `/m/${MAIN}?replies=${PROPOSAL}`,
			tag: `reply-${PROPOSAL}`,
		});
		expect(JSON.stringify(first)).not.toContain('Secret');
		expect(JSON.stringify(first)).not.toContain('Noa');

		// a second reply inside the window: saved, no push
		h.clock.now = NOW + REPLY_PUSH_MIN_GAP_MS - 1;
		await postReply(db, CLASSMATE, req(), h.deps);
		expect(h.sent).toHaveLength(1);
		// after the window: pushed again, counting both unread replies
		h.clock.now = NOW + REPLY_PUSH_MIN_GAP_MS + 1;
		await postReply(db, CLASSMATE, req(), h.deps);
		expect(h.sent).toHaveLength(2);
		expect((h.sent[1][0] as Message & { data: Record<string, string> }).data.body).toBe(
			replyPushBody('en', 3),
		);
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyPushCount: 2 });
	});

	it('never pushes the author about their own reply, and drops invalid devices', async () => {
		const fake = seedLesson();
		device(fake, 'tok-dead');
		const db = fake.asFirestore();
		const own = harness();
		await postReply(db, AUTHOR, req(), own.deps);
		expect(own.sent).toHaveLength(0);
		const h = harness(false, ['tok-dead']);
		await postReply(db, CLASSMATE, req(), h.deps);
		expect(h.sent).toHaveLength(1);
		expect(fake.read('pushNotifications/tok-dead')).toBeUndefined();
	});
});

describe('decideReplyPush', () => {
	const base: ReplyPushInput = {
		now: NOW,
		lessonStatus: 'live',
		replierUid: CLASSMATE,
		authorUid: AUTHOR,
		hasDevice: true,
		lastPushAt: undefined,
		pushCount: undefined,
	};

	it('sends for a classmate reply to a device on a running lesson', () => {
		expect(decideReplyPush(base)).toEqual({ send: true });
		expect(decideReplyPush({ ...base, lessonStatus: 'open' })).toEqual({ send: true });
	});

	it('skips own replies, stopped lessons, no device, the window and the cap', () => {
		expect(decideReplyPush({ ...base, replierUid: AUTHOR })).toEqual({
			send: false,
			reason: 'self',
		});
		expect(decideReplyPush({ ...base, lessonStatus: 'paused' })).toMatchObject({
			reason: 'lesson-stopped',
		});
		expect(decideReplyPush({ ...base, lessonStatus: 'ended' })).toMatchObject({
			reason: 'lesson-stopped',
		});
		expect(decideReplyPush({ ...base, hasDevice: false })).toMatchObject({ reason: 'no-device' });
		expect(decideReplyPush({ ...base, lastPushAt: NOW - REPLY_PUSH_MIN_GAP_MS + 1 })).toMatchObject(
			{ reason: 'too-soon' },
		);
		expect(decideReplyPush({ ...base, lastPushAt: NOW - REPLY_PUSH_MIN_GAP_MS })).toEqual({
			send: true,
		});
		expect(decideReplyPush({ ...base, pushCount: REPLY_PUSH_MAX_PER_LESSON })).toMatchObject({
			reason: 'cap',
		});
	});
});

describe('reply counters and words', () => {
	it('moves the visible count only on a real change, never below zero', () => {
		expect(replyCountAfter(3, false, true)).toBe(2);
		expect(replyCountAfter(3, true, false)).toBe(4);
		expect(replyCountAfter(3, true, true)).toBe(3);
		expect(replyCountAfter(undefined, false, true)).toBe(0);
	});

	it('counts unread replies by others, not hidden, after the read mark', () => {
		const replies = [
			{ creatorId: CLASSMATE, createdAt: 10 },
			{ creatorId: CLASSMATE, createdAt: 30 },
			{ creatorId: AUTHOR, createdAt: 40 },
			{ creatorId: CLASSMATE, createdAt: 50, hide: true },
		];
		expect(unreadForAuthor(replies, AUTHOR, 20)).toBe(1);
		expect(unreadForAuthor(replies, AUTHOR, undefined)).toBe(2);
	});

	it('speaks the device language and falls back to Hebrew', () => {
		expect(replyPushLanguageOf('ar-EG')).toBe('ar');
		expect(replyPushLanguageOf('xx')).toBe('he');
		expect(replyPushLanguageOf(undefined)).toBe('he');
		expect(replyPushBody('he', 1)).toBe('יש תגובה חדשה להצעה שלכם');
		expect(replyPushBody('en', 4)).toBe('4 new replies to your proposal');
		const [message] = buildReplyMessages([{ token: 't', language: 'nl' }], {
			mainId: MAIN,
			proposalId: PROPOSAL,
			lessonTitle: 'L',
			count: 1,
		});
		expect(message).not.toHaveProperty('notification');
	});
});

describe('classSetItemHidden on a reply', () => {
	it('hides and restores a reply and moves the proposal count', async () => {
		const fake = seedLesson();
		const db = fake.asFirestore();
		const request = req();
		await postReply(db, CLASSMATE, request, harness().deps);
		await setItemHidden(db, TEACHER, { mainId: MAIN, statementId: request.replyId, hidden: true });
		expect(fake.read(`statements/${request.replyId}`)).toMatchObject({ hide: true });
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyCount: 0 });
		// hiding twice does not count twice
		await setItemHidden(db, TEACHER, { mainId: MAIN, statementId: request.replyId, hidden: true });
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyCount: 0 });
		await setItemHidden(db, TEACHER, { mainId: MAIN, statementId: request.replyId, hidden: false });
		expect(fake.read(`statements/${PROPOSAL}`)).toMatchObject({ replyCount: 1 });
	});

	it('refuses a students hide and a reply of another lesson', async () => {
		const fake = seedLesson();
		const db = fake.asFirestore();
		const request = req();
		await postReply(db, CLASSMATE, request, harness().deps);
		await expect(
			setItemHidden(db, CLASSMATE, { mainId: MAIN, statementId: request.replyId, hidden: true }),
		).rejects.toMatchObject({ code: 'permission-denied' });
		fake.seed('statements/stray-reply', {
			statementId: 'stray-reply',
			parentId: 'elsewhere',
			statementType: 'statement',
			classReply: { role: 'class', proposalCreatorId: AUTHOR },
		});
		await expect(
			setItemHidden(db, TEACHER, { mainId: MAIN, statementId: 'stray-reply', hidden: true }),
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});
});
