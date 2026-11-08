import { describe, it, expect } from 'vitest';
import { AgoraMessageKind, StatementType, createAgoraThreadKey } from '@freedi/shared-types';
import type { AgoraProposal } from '../proposals';
import { boardNews, noteNews, threadNews, type NoteNewsSource } from '../flows/noteNews';

const ME = 'me';
const HELPER = 'helper';
const OTHER = 'other';

function line(
	id: string,
	parentId: string,
	creatorId: string,
	threadUid: string,
	createdAt: number,
	kind: AgoraMessageKind = AgoraMessageKind.chat,
): AgoraProposal {
	return {
		statementId: id,
		statement: id,
		creatorId,
		anonName: creatorId,
		parentId,
		statementType: StatementType.suggestion,
		createdAt,
		lastUpdate: createdAt,
		agoraMessageKind: kind,
		agoraThreadUserId: threadUid,
	};
}

/**
 * A source over a flat list of lines and a read mark per conversation —
 * the same arithmetic `threadUnreadCount` does, minus the participant doc.
 */
function sourceOf(lines: AgoraProposal[], seen: Record<string, number> = {}): NoteNewsSource {
	const threadUid = (l: AgoraProposal): string => l.agoraThreadUserId ?? l.creatorId;

	return {
		threads: (noteId) => {
			const map = new Map<string, AgoraProposal[]>();
			for (const l of lines.filter((x) => x.parentId === noteId)) {
				map.set(threadUid(l), [...(map.get(threadUid(l)) ?? []), l]);
			}

			return map;
		},
		messages: (noteId, helperUid) =>
			lines.filter((l) => l.parentId === noteId && threadUid(l) === helperUid),
		unread: (key, messages, myUid) =>
			messages.filter((l) => l.creatorId !== myUid && l.createdAt > (seen[key] ?? 0)).length,
	};
}

const mine = { statementId: 'mine', creatorId: ME };
const theirs = { statementId: 'theirs', creatorId: OTHER };

describe('noteNews', () => {
	it('counts every classmate conversation on my note, ideas included', () => {
		const source = sourceOf([
			line('a1', 'mine', HELPER, HELPER, 10, AgoraMessageKind.suggestion),
			line('a2', 'mine', HELPER, HELPER, 20),
			line('b1', 'mine', OTHER, OTHER, 30),
			// My own reply is not news to me
			line('m1', 'mine', ME, HELPER, 40),
		]);
		expect(noteNews(source, mine, ME)).toBe(3);
	});

	it("on a classmate's note counts only the conversation I started", () => {
		const source = sourceOf([
			line('r1', 'theirs', OTHER, ME, 10),
			// The owner answering someone else is their business
			line('r2', 'theirs', OTHER, HELPER, 20),
			line('h1', 'theirs', HELPER, HELPER, 30),
		]);
		expect(noteNews(source, theirs, ME)).toBe(1);
		expect(threadNews(source, 'theirs', ME, ME)).toBe(1);
	});

	it('clears up to the read mark of that conversation only', () => {
		const source = sourceOf(
			[
				line('a1', 'mine', HELPER, HELPER, 10),
				line('a2', 'mine', HELPER, HELPER, 20),
				line('b1', 'mine', OTHER, OTHER, 30),
			],
			{ [createAgoraThreadKey('mine', HELPER)]: 20 },
		);
		expect(noteNews(source, mine, ME)).toBe(1);
	});

	it('ignores the system notices — an edit or an award is not a message', () => {
		const source = sourceOf([
			line('e1', 'theirs', OTHER, ME, 10, AgoraMessageKind.edit),
			line('w1', 'theirs', OTHER, ME, 20, AgoraMessageKind.award),
		]);
		expect(noteNews(source, theirs, ME)).toBe(0);
	});

	it('sums the board over my note and the classmates’ notes I wrote to', () => {
		const source = sourceOf([
			line('a1', 'mine', HELPER, HELPER, 10),
			line('r1', 'theirs', OTHER, ME, 20),
			line('x1', 'untouched', OTHER, HELPER, 30),
		]);
		const untouched = { statementId: 'untouched', creatorId: OTHER };
		expect(boardNews(source, [mine, theirs, untouched], ME)).toBe(2);
		expect(boardNews(source, [], ME)).toBe(0);
	});
});
