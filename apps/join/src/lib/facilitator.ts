import m from 'mithril';
import { Statement, Collections } from '@freedi/shared-types';
import { db, doc, getDoc } from './firebase';

export const FACILITATOR_TOAST_MS = 1200;
export const FACILITATOR_REDIRECT_DELAY_MS = 700;

export type JoinTarget =
  | { type: 'hub' }
  | { type: 'solutions'; questionId: string }
  | { type: 'chat'; questionId: string; optionId: string };

const optionParentCache = new Map<string, string>();

/** Strip leading/trailing whitespace and trailing slashes (but preserve a single root slash). */
function normalize(path: string): string {
  return path.trim().replace(/\/+$/, '') || '/';
}

/** Lookup an option's parent (= question) id, caching the result so we only
 *  hit Firestore once per option across redirects. */
async function lookupOptionParent(optionId: string): Promise<string | null> {
  const cached = optionParentCache.get(optionId);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, Collections.statements, optionId));
    if (!snap.exists()) return null;
    const parentId = (snap.data() as Statement).parentId;
    if (!parentId) return null;
    optionParentCache.set(optionId, parentId);

    return parentId;
  } catch (err) {
    console.error('[facilitator] option parent lookup failed:', err);

    return null;
  }
}

/** Translate a main-app powerFollowMe path into a join-app target.
 *  Returns null when the path doesn't map to any of the three facilitated
 *  views — in that case participants should stay where they are. */
export async function mapMainAppPathToJoinTarget(
  path: string | undefined,
  mainId: string,
): Promise<JoinTarget | null> {
  if (!path) return null;

  const normalized = normalize(path);
  const queryIdx = normalized.indexOf('?');
  const pathname = queryIdx === -1 ? normalized : normalized.slice(0, queryIdx);
  const segments = pathname.split('/').filter(Boolean);

  // Expect /statement/{id}[/screen]
  if (segments[0] !== 'statement') return null;
  const id = segments[1];
  if (!id) return null;

  const screen = segments[2];

  // Chat for an option: /statement/{optionId}/chat
  if (screen === 'chat') {
    const questionId = await lookupOptionParent(id);
    if (!questionId) return null;

    return { type: 'chat', questionId, optionId: id };
  }

  // Bare /statement/{mainId} (with or without ?tab=…) → Main Hub
  if (id === mainId && (screen === undefined || segments.length === 2)) {
    return { type: 'hub' };
  }

  // Bare /statement/{questionId} for a sub-question → Solutions
  if (!screen) {
    return { type: 'solutions', questionId: id };
  }

  // Out-of-scope (vote, mind-map, settings, etc.)
  return null;
}

export function joinTargetToRoute(target: JoinTarget, mainId: string): string {
  switch (target.type) {
    case 'hub':
      return `/m/${mainId}`;
    case 'solutions':
      return `/m/${mainId}/q/${target.questionId}`;
    case 'chat':
      return `/m/${mainId}/q/${target.questionId}/s/${target.optionId}`;
  }
}

/** True when the participant is on any /m/:mid/... route — Solutions and Chat
 *  use this to switch into display-only mode. */
export function isFacilitatedMode(): boolean {
  return m.route.get().startsWith('/m/');
}
