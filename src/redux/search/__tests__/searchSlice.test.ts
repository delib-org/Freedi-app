import { StatementType, type SearchCandidate } from '@freedi/shared-types';
import searchReducer, {
	clearSearchCandidates,
	searchCandidateCacheSelector,
	setSearchCandidates,
	type SearchCandidateCache,
	type SearchState,
} from '../searchSlice';

const candidate: SearchCandidate = {
	statementId: 's1',
	title: 'Talk',
	statementType: StatementType.question,
	parentId: 'top',
	topParentId: 's1',
	lastUpdate: 1,
};

function cache(userId: string): SearchCandidateCache {
	return { userId, candidates: [candidate], fetchedAt: 100, truncated: false };
}

describe('searchSlice', () => {
	it('starts empty', () => {
		expect(searchReducer(undefined, { type: '@@init' })).toEqual({ caches: {} });
	});

	it('stores a cache per scope', () => {
		let state: SearchState = searchReducer(
			undefined,
			setSearchCandidates({ scope: 'home', cache: cache('u1') }),
		);
		state = searchReducer(
			state,
			setSearchCandidates({ scope: 'subscriptions', cache: cache('u1') }),
		);

		expect(Object.keys(state.caches).sort()).toEqual(['home', 'subscriptions']);
	});

	it('replaces an older cache for the same scope', () => {
		let state = searchReducer(
			undefined,
			setSearchCandidates({ scope: 'home', cache: cache('u1') }),
		);
		state = searchReducer(
			state,
			setSearchCandidates({
				scope: 'home',
				cache: { ...cache('u1'), fetchedAt: 200, candidates: [] },
			}),
		);

		expect(state.caches.home?.fetchedAt).toBe(200);
		expect(state.caches.home?.candidates).toEqual([]);
	});

	it('clears every cache', () => {
		const state = searchReducer(
			searchReducer(undefined, setSearchCandidates({ scope: 'home', cache: cache('u1') })),
			clearSearchCandidates(),
		);

		expect(state.caches).toEqual({});
	});

	it('only hands a cache to the user it was downloaded for', () => {
		const search = searchReducer(
			undefined,
			setSearchCandidates({ scope: 'home', cache: cache('u1') }),
		);

		expect(searchCandidateCacheSelector('home', 'u1')({ search })?.candidates).toEqual([candidate]);
		expect(searchCandidateCacheSelector('home', 'u2')({ search })).toBeUndefined();
		expect(searchCandidateCacheSelector('home', undefined)({ search })).toBeUndefined();
		expect(searchCandidateCacheSelector('subscriptions', 'u1')({ search })).toBeUndefined();
	});
});
