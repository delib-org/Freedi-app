/**
 * Allowed-edge table + cycle guard (§1.1 of the plan). Validated at write time
 * by the chat `sendMessage` action and used by the tree-builder.
 *
 * ```
 * question  →  option | question                 answered by options, refined by sub-questions
 * option    →  evidence | statement | question   the claim under test
 * evidence  →  evidence | statement              evidence about evidence (recursive)
 * statement →  statement                          chatter; never scored
 * ```
 */
import type { NodeKind } from './types';

const ALLOWED_CHILDREN: Record<NodeKind, readonly NodeKind[]> = {
  question: ['option', 'question'],
  option: ['evidence', 'statement', 'question'],
  evidence: ['evidence', 'statement'],
  statement: ['statement'],
};

export function isAllowedEdge(parentKind: NodeKind, childKind: NodeKind): boolean {
  return ALLOWED_CHILDREN[parentKind]?.includes(childKind) ?? false;
}

export function allowedChildren(parentKind: NodeKind): readonly NodeKind[] {
  return ALLOWED_CHILDREN[parentKind] ?? [];
}

/** Throws a descriptive error if `childKind` may not be placed under `parentKind`. */
export function assertAllowedEdge(parentKind: NodeKind, childKind: NodeKind): void {
  if (!isAllowedEdge(parentKind, childKind)) {
    throw new Error(
      `Illegal containment edge: a "${parentKind}" cannot contain a "${childKind}". ` +
        `Allowed children of "${parentKind}": [${allowedChildren(parentKind).join(', ')}].`,
    );
  }
}

/**
 * Cycle guard. A node may not be placed under one of its own descendants.
 * `parentAncestorIds` is the candidate parent's full ancestor chain
 * (`Statement.parents`) plus the candidate parent's own id.
 */
export function createsCycle(childId: string, parentAncestorIds: readonly string[]): boolean {
  return parentAncestorIds.includes(childId);
}

export function assertNoCycle(childId: string, parentAncestorIds: readonly string[]): void {
  if (createsCycle(childId, parentAncestorIds)) {
    throw new Error(`Cycle detected: "${childId}" is an ancestor of its proposed parent.`);
  }
}
