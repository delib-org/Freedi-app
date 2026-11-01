import { Access, Statement } from '@freedi/shared-types';
import { resolveEffectiveAccess } from '../effectiveAccess';

type Source = Pick<Statement, 'parentId' | 'membership'>;
const space = (parentId: string, access?: Access): Source => ({
	parentId,
	membership: access ? { access } : undefined,
});

describe('resolveEffectiveAccess', () => {
	it('uses the space own level', () => {
		expect(
			resolveEffectiveAccess(space('g1', Access.moderated), space('top', Access.openToAll)),
		).toBe(Access.moderated);
	});

	it('inherits the top parent level when the sub-space has none', () => {
		expect(resolveEffectiveAccess(space('g1'), space('top', Access.moderated))).toBe(
			Access.moderated,
		);
	});

	it('reads the deprecated open on a sub-space as inherit', () => {
		expect(resolveEffectiveAccess(space('g1', Access.open), space('top', Access.secret))).toBe(
			Access.secret,
		);
	});

	it('keeps a top-level space own level, even the deprecated one', () => {
		expect(resolveEffectiveAccess(space('top', Access.open), undefined)).toBe(Access.open);
	});

	it('falls back to Open to all', () => {
		expect(resolveEffectiveAccess(space('g1'), null)).toBe(Access.openToAll);
		expect(resolveEffectiveAccess(undefined, undefined)).toBe(Access.openToAll);
	});
});
