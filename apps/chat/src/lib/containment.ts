/**
 * Re-export of the pure containment rules (§1.1) so app code imports from one
 * place. Used by write actions (`sendMessage`) and the tree-builder.
 */
export {
	isAllowedEdge,
	assertAllowedEdge,
	allowedChildren,
	createsCycle,
	assertNoCycle,
} from '@freedi/evidence';
export type { NodeKind } from '@freedi/evidence';
