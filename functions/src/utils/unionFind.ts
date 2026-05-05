/**
 * Disjoint-set / Union-Find with path compression and union-by-rank.
 *
 * Used by the bulk idea-synthesis pipeline to cluster verified-same edges into
 * connected components. See docs/papers/idea-synthesis-paper.md §2.7.
 *
 * Operates on string element ids and lazily registers them on first reference.
 */
export class UnionFind {
	private parent = new Map<string, string>();
	private rank = new Map<string, number>();

	/**
	 * Ensure the element exists as its own singleton set.
	 * Idempotent.
	 */
	add(id: string): void {
		if (!this.parent.has(id)) {
			this.parent.set(id, id);
			this.rank.set(id, 0);
		}
	}

	/**
	 * Find the canonical representative of the set containing id.
	 * Auto-adds id if previously unseen.
	 */
	find(id: string): string {
		this.add(id);
		let current = id;
		const path: string[] = [];
		while (this.parent.get(current) !== current) {
			path.push(current);
			current = this.parent.get(current) as string;
		}
		// Path compression: point every node on the path directly to the root.
		for (const node of path) {
			this.parent.set(node, current);
		}

		return current;
	}

	/**
	 * Merge the sets containing a and b. Returns true if a merge occurred,
	 * false if they were already in the same set.
	 */
	union(a: string, b: string): boolean {
		const rootA = this.find(a);
		const rootB = this.find(b);
		if (rootA === rootB) return false;

		const rankA = this.rank.get(rootA) ?? 0;
		const rankB = this.rank.get(rootB) ?? 0;

		if (rankA < rankB) {
			this.parent.set(rootA, rootB);
		} else if (rankA > rankB) {
			this.parent.set(rootB, rootA);
		} else {
			this.parent.set(rootB, rootA);
			this.rank.set(rootA, rankA + 1);
		}

		return true;
	}

	/**
	 * Whether a and b belong to the same set.
	 */
	connected(a: string, b: string): boolean {
		return this.find(a) === this.find(b);
	}

	/**
	 * Return all connected components as a list of id arrays.
	 * Singletons (elements that were added but never unioned) are included.
	 */
	components(): string[][] {
		const groups = new Map<string, string[]>();
		for (const id of this.parent.keys()) {
			const root = this.find(id);
			const group = groups.get(root);
			if (group) {
				group.push(id);
			} else {
				groups.set(root, [id]);
			}
		}

		return Array.from(groups.values());
	}

	/**
	 * Number of distinct sets currently tracked.
	 */
	size(): number {
		const roots = new Set<string>();
		for (const id of this.parent.keys()) {
			roots.add(this.find(id));
		}

		return roots.size;
	}
}
