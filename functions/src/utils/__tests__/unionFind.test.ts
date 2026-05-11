import { UnionFind } from '../unionFind';

describe('UnionFind', () => {
	describe('add and find', () => {
		it('treats a fresh element as its own root', () => {
			const uf = new UnionFind();
			uf.add('a');
			expect(uf.find('a')).toBe('a');
		});

		it('auto-adds elements on find', () => {
			const uf = new UnionFind();
			expect(uf.find('x')).toBe('x');
			expect(uf.size()).toBe(1);
		});

		it('add is idempotent', () => {
			const uf = new UnionFind();
			uf.add('a');
			uf.add('a');
			expect(uf.size()).toBe(1);
		});
	});

	describe('union and connected', () => {
		it('merges two singletons', () => {
			const uf = new UnionFind();
			expect(uf.union('a', 'b')).toBe(true);
			expect(uf.connected('a', 'b')).toBe(true);
			expect(uf.size()).toBe(1);
		});

		it('returns false when already connected', () => {
			const uf = new UnionFind();
			uf.union('a', 'b');
			expect(uf.union('a', 'b')).toBe(false);
			expect(uf.union('b', 'a')).toBe(false);
		});

		it('handles transitive merges', () => {
			const uf = new UnionFind();
			uf.union('a', 'b');
			uf.union('b', 'c');
			expect(uf.connected('a', 'c')).toBe(true);
			expect(uf.size()).toBe(1);
		});

		it('keeps unrelated sets disjoint', () => {
			const uf = new UnionFind();
			uf.union('a', 'b');
			uf.union('c', 'd');
			expect(uf.connected('a', 'c')).toBe(false);
			expect(uf.size()).toBe(2);
		});
	});

	describe('components', () => {
		it('returns singletons for unmerged elements', () => {
			const uf = new UnionFind();
			uf.add('a');
			uf.add('b');
			uf.add('c');
			const comps = uf.components().map((c) => c.sort());
			expect(comps.sort()).toEqual([['a'], ['b'], ['c']]);
		});

		it('returns merged components', () => {
			const uf = new UnionFind();
			uf.union('a', 'b');
			uf.union('b', 'c');
			uf.add('d');
			uf.union('e', 'f');
			const comps = uf
				.components()
				.map((c) => c.sort())
				.sort((x, y) => x[0].localeCompare(y[0]));
			expect(comps).toEqual([['a', 'b', 'c'], ['d'], ['e', 'f']]);
		});

		it('handles a chain through many unions', () => {
			const uf = new UnionFind();
			const ids = Array.from({ length: 100 }, (_, i) => `n${i}`);
			for (let i = 1; i < ids.length; i++) {
				uf.union(ids[i - 1], ids[i]);
			}
			expect(uf.size()).toBe(1);
			const comps = uf.components();
			expect(comps).toHaveLength(1);
			expect(comps[0].sort()).toEqual([...ids].sort());
		});
	});

	describe('path compression', () => {
		it('makes repeated finds cheap (smoke test)', () => {
			const uf = new UnionFind();
			const ids = Array.from({ length: 1000 }, (_, i) => `n${i}`);
			for (let i = 1; i < ids.length; i++) {
				uf.union(ids[i - 1], ids[i]);
			}

			const start = Date.now();
			for (const id of ids) {
				uf.find(id);
			}
			const elapsed = Date.now() - start;
			expect(elapsed).toBeLessThan(50);
		});
	});

	describe('synthesis-shaped scenario', () => {
		it('forms expected groups for a near-duplicate edge set', () => {
			const uf = new UnionFind();
			const sameEdges: Array<[string, string]> = [
				['s1', 's2'],
				['s2', 's3'],
				['s4', 's5'],
				['s10', 's11'],
				['s11', 's12'],
				['s12', 's13'],
			];
			uf.add('s6');
			uf.add('s7');
			uf.add('s8');
			uf.add('s9');

			for (const [a, b] of sameEdges) {
				uf.union(a, b);
			}

			const groups = uf
				.components()
				.map((c) => c.sort())
				.sort((x, y) => x[0].localeCompare(y[0]));

			expect(groups).toEqual([
				['s1', 's2', 's3'],
				['s10', 's11', 's12', 's13'],
				['s4', 's5'],
				['s6'],
				['s7'],
				['s8'],
				['s9'],
			]);
		});
	});
});
