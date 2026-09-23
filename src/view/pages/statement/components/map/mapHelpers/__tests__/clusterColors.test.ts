import {
	CLUSTER_PALETTE,
	assignClusterColors,
	deriveClusterPalette,
	lightenHex,
	paletteIndexForId,
	withFrame,
} from '../clusterColors';

describe('clusterColors', () => {
	describe('assignClusterColors', () => {
		it('gives every cluster a distinct palette slot while slots remain', () => {
			const ids = Array.from({ length: CLUSTER_PALETTE.length }, (_, i) => `cluster-${i}`);
			const colors = assignClusterColors(ids.map((id) => ({ id })));
			const lines = new Set(ids.map((id) => colors.get(id)?.line));

			expect(lines.size).toBe(CLUSTER_PALETTE.length);
		});

		it('keeps the hashed slot when it is free', () => {
			const colors = assignClusterColors([{ id: 'alone' }]);

			expect(colors.get('alone')?.line).toBe(CLUSTER_PALETTE[paletteIndexForId('alone')].line);
		});

		it('moves only the later cluster when two hash to the same slot', () => {
			// Find two ids that collide.
			const first = 'a';
			const target = paletteIndexForId(first);
			let second = 'b';
			for (let i = 0; i < 10000; i++) {
				const candidate = `x${i}`;
				if (candidate !== first && paletteIndexForId(candidate) === target) {
					second = candidate;
					break;
				}
			}
			expect(paletteIndexForId(second)).toBe(target);

			const colors = assignClusterColors([{ id: first }, { id: second }]);
			expect(colors.get(first)?.line).toBe(CLUSTER_PALETTE[target].line);
			expect(colors.get(second)?.line).toBe(
				CLUSTER_PALETTE[(target + 1) % CLUSTER_PALETTE.length].line,
			);
		});

		it('respects a saved preset colour and reserves its slot', () => {
			const saved = CLUSTER_PALETTE[3].line;
			const ids = Array.from({ length: 6 }, (_, i) => `c${i}`);
			const colors = assignClusterColors([
				{ id: 'saved', color: saved },
				...ids.map((id) => ({ id })),
			]);

			expect(colors.get('saved')?.line).toBe(saved);
			for (const id of ids) expect(colors.get(id)?.line).not.toBe(saved);
		});

		it('derives a tint for a custom saved colour', () => {
			const colors = assignClusterColors([{ id: 'custom', color: '#123456' }]);
			const entry = colors.get('custom');

			expect(entry?.line).toBe('#123456');
			expect(entry?.card).toBe(deriveClusterPalette('#123456').card);
			expect(entry?.frame).toBe(lightenHex(entry?.card ?? '', 0.55));
		});

		it('wraps past the palette size instead of failing', () => {
			const ids = Array.from({ length: CLUSTER_PALETTE.length + 5 }, (_, i) => `many-${i}`);
			const colors = assignClusterColors(ids.map((id) => ({ id })));

			expect(colors.size).toBe(ids.length);
			for (const id of ids) expect(colors.get(id)?.line).toBeDefined();
		});

		it('is deterministic for the same input order', () => {
			const input = ['p', 'q', 'r', 's'].map((id) => ({ id }));
			const a = assignClusterColors(input);
			const b = assignClusterColors(input);
			for (const { id } of input) expect(a.get(id)).toEqual(b.get(id));
		});
	});

	describe('withFrame', () => {
		it('makes the frame lighter than the card', () => {
			const entry = withFrame(CLUSTER_PALETTE[2]);
			const card = parseInt(entry.card.slice(1), 16);
			const frame = parseInt(entry.frame.slice(1), 16);

			expect(frame).toBeGreaterThan(card);
		});
	});

	describe('lightenHex', () => {
		it('returns white at 1 and the input at 0', () => {
			expect(lightenHex('#000000', 1)).toBe('#ffffff');
			expect(lightenHex('#4a9fe0', 0)).toBe('#4a9fe0');
		});

		it('returns the input unchanged when it is not a hex colour', () => {
			expect(lightenHex('red', 0.5)).toBe('red');
		});
	});
});
