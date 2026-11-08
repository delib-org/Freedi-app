import {
	AgoraScenarioPost,
	buildPostThread,
	canUnhidePost,
	createAgoraReportId,
	repointTagIds,
	resolveTagAlias,
} from '../models/agora';

function post(
	id: string,
	createdAt: number,
	extra: Partial<AgoraScenarioPost> = {},
): AgoraScenarioPost {
	return {
		postId: id,
		scenarioId: 's1',
		scenarioOwnerId: 'owner',
		authorId: 'a',
		authorName: 'Dana',
		text: id,
		hidden: false,
		createdAt,
		lastUpdate: createdAt,
		...extra,
	};
}

describe('buildPostThread', () => {
	it('puts newest top-level posts first and replies oldest first', () => {
		const thread = buildPostThread(
			[
				post('old', 1),
				post('new', 5),
				post('r2', 4, { parentId: 'old' }),
				post('r1', 2, { parentId: 'old' }),
			],
			false,
		);
		expect(thread.map((entry) => entry.post.postId)).toEqual(['new', 'old']);
		expect(thread[1].replies.map((reply) => reply.postId)).toEqual(['r1', 'r2']);
	});

	it('never nests deeper than one level', () => {
		const thread = buildPostThread(
			[
				post('top', 1),
				post('reply', 2, { parentId: 'top' }),
				post('deep', 3, { parentId: 'reply' }),
			],
			false,
		);
		expect(thread).toHaveLength(1);
		expect(thread[0].replies.map((reply) => reply.postId)).toEqual(['reply']);
	});

	it('drops hidden posts, and the replies of a hidden post, unless asked to show them', () => {
		const posts = [
			post('top', 1, { hidden: true, hiddenBy: 'admin' }),
			post('reply', 2, { parentId: 'top' }),
			post('other', 3),
		];
		expect(buildPostThread(posts, false).map((entry) => entry.post.postId)).toEqual(['other']);
		const shown = buildPostThread(posts, true);
		expect(shown.map((entry) => entry.post.postId)).toEqual(['other', 'top']);
		expect(shown[1].replies).toHaveLength(1);
	});

	it('drops a reply whose parent is gone', () => {
		expect(buildPostThread([post('lost', 1, { parentId: 'nope' })], true)).toEqual([]);
	});
});

describe('canUnhidePost', () => {
	it('lets an admin lift any hide', () => {
		expect(canUnhidePost({ hiddenBy: 'admin' }, { isAdmin: true, isOwner: false })).toBe(true);
		expect(canUnhidePost({ hiddenBy: 'owner' }, { isAdmin: true, isOwner: false })).toBe(true);
	});
	it('lets the scenario author lift only their own hide', () => {
		expect(canUnhidePost({ hiddenBy: 'owner' }, { isAdmin: false, isOwner: true })).toBe(true);
		expect(canUnhidePost({ hiddenBy: 'admin' }, { isAdmin: false, isOwner: true })).toBe(false);
	});
	it('lets nobody else', () => {
		expect(canUnhidePost({ hiddenBy: 'owner' }, { isAdmin: false, isOwner: false })).toBe(false);
	});
});

describe('reports and tags', () => {
	it('makes one report id per reporter per target', () => {
		expect(createAgoraReportId('post', 'p1', 'u1')).toBe('post__p1__u1');
	});

	it('swaps a merged tag in place and keeps one of two', () => {
		expect(repointTagIds(['a', 'dup', 'b'], 'dup', 'canon')).toEqual({
			ids: ['a', 'canon', 'b'],
			changed: true,
		});
		expect(repointTagIds(['canon', 'dup'], 'dup', 'canon')).toEqual({
			ids: ['canon'],
			changed: true,
		});
		expect(repointTagIds(['a'], 'dup', 'canon')).toEqual({ ids: ['a'], changed: false });
	});

	it('follows alias pointers to the canonical tag and survives a cycle', () => {
		const tags = new Map<string, { aliasOf?: string }>([
			['a', { aliasOf: 'b' }],
			['b', { aliasOf: 'c' }],
			['c', {}],
			['x', { aliasOf: 'y' }],
			['y', { aliasOf: 'x' }],
		]);
		expect(resolveTagAlias('a', tags)).toBe('c');
		expect(resolveTagAlias('c', tags)).toBe('c');
		expect(resolveTagAlias('x', tags)).toBe('x');
		expect(resolveTagAlias('gone', tags)).toBe('gone');
	});
});
