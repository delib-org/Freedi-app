import m from 'mithril';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  Unsubscribe,
} from './firebase';
import { getUserState } from './user';
import {
  Collections,
  Statement,
  StatementType,
  Creator,
  createStatementObject,
  CutoffBy,
} from '@freedi/shared-types';
import type { ResultsSettings } from '@freedi/shared-types';

let question: Statement | null = null;
let allOptions: Statement[] = [];
let messages: Statement[] = [];
let chatUnsubscribe: Unsubscribe | null = null;
let joinFormSubmitted = new Set<string>();
let customDisplayName: string | null = null;

const VISITED_KEY = 'freedi_join_visited';

function getVisitedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }

  return new Set();
}

function saveVisitedSet(visited: Set<string>): void {
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify([...visited]));
  } catch { /* ignore */ }
}

export function markOptionRead(optionId: string): void {
  const visited = getVisitedSet();
  visited.add(optionId);
  saveVisitedSet(visited);
}

export function getUnreadCount(): number {
  const visible = getVisibleOptions();
  const visited = getVisitedSet();

  return visible.filter((o) => !visited.has(o.statementId)).length;
}

export function getTotalVisibleCount(): number {
  return getVisibleOptions().length;
}

export function setCustomDisplayName(name: string): void {
  customDisplayName = name;
  try {
    localStorage.setItem('freedi_join_display_name', name);
  } catch { /* ignore */ }
}

export function getCustomDisplayName(): string | null {
  if (customDisplayName) return customDisplayName;

  try {
    const stored = localStorage.getItem('freedi_join_display_name');
    if (stored) {
      customDisplayName = stored;

      return stored;
    }
  } catch { /* ignore */ }

  return null;
}

export function needsDisplayName(): boolean {
  const user = getUserState().user;
  if (!user) return true;
  if (!user.isAnonymous) return false;

  return !getCustomDisplayName();
}

export function getQuestion(): Statement | null {
  return question;
}

export function getAllOptions(): Statement[] {
  return allOptions;
}

export function getMessages(): Statement[] {
  return messages;
}

export function getVisibleOptions(): Statement[] {
  let opts = allOptions
    .filter((o) => o.joinStatus !== 'failed')
    .sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0));

  if (!question?.resultsSettings) return opts;

  const rs: ResultsSettings = question.resultsSettings;

  if (rs.cutoffBy === CutoffBy.topOptions && rs.numberOfResults) {
    opts = opts.slice(0, rs.numberOfResults);
  } else if (rs.cutoffBy === CutoffBy.aboveThreshold && rs.minConsensus != null) {
    opts = opts.filter((o) => (o.consensus ?? 0) >= (rs.minConsensus ?? 0));
  }

  return opts;
}

function buildCreator(): Creator | null {
  const user = getUserState().user;
  if (!user) return null;

  let displayName = user.displayName || 'Anonymous';
  if (user.isAnonymous) {
    const custom = getCustomDisplayName();
    if (custom) displayName = custom;
  }

  return {
    uid: user.uid,
    displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
    email: user.email,
  };
}

export function getCreator(): Creator | null {
  return buildCreator();
}

export async function loadQuestion(questionId: string): Promise<void> {
  const qDoc = await getDoc(doc(db, Collections.statements, questionId));
  if (!qDoc.exists()) {
    question = null;
    allOptions = [];
    m.redraw();

    return;
  }

  question = qDoc.data() as Statement;

  const optionsQuery = query(
    collection(db, Collections.statements),
    where('parentId', '==', questionId),
    where('statementType', '==', StatementType.option),
  );
  const optionsSnap = await getDocs(optionsQuery);
  allOptions = optionsSnap.docs.map((d) => d.data() as Statement);

  m.redraw();
}

export function subscribeOptions(questionId: string): Unsubscribe {
  const optionsQuery = query(
    collection(db, Collections.statements),
    where('parentId', '==', questionId),
    where('statementType', '==', StatementType.option),
  );

  return onSnapshot(optionsQuery, (snap) => {
    allOptions = snap.docs.map((d) => d.data() as Statement);
    m.redraw();
  });
}

export function subscribeChat(optionId: string): void {
  unsubscribeChat();

  const chatQuery = query(
    collection(db, Collections.statements),
    where('parentId', '==', optionId),
    where('statementType', '==', StatementType.statement),
    orderBy('createdAt'),
  );

  chatUnsubscribe = onSnapshot(chatQuery, (snap) => {
    messages = snap.docs.map((d) => d.data() as Statement);
    m.redraw();
  });
}

export function unsubscribeChat(): void {
  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }
  messages = [];
}

export async function sendMessage(optionId: string, text: string): Promise<void> {
  const creator = buildCreator();
  if (!creator || !text.trim()) return;

  const topParentId = question?.statementId || optionId;

  const newStatement = createStatementObject({
    statement: text.trim(),
    statementType: StatementType.statement,
    parentId: optionId,
    topParentId,
    creatorId: creator.uid,
    creator,
  });

  if (!newStatement) return;

  await setDoc(
    doc(db, Collections.statements, newStatement.statementId),
    newStatement,
  );
}

export type JoinRole = 'activist' | 'organizer';

export interface ToggleJoiningResult {
  success: boolean;
  leftStatementId?: string;
  leftStatementTitle?: string;
  error?: string;
}

export async function toggleJoining(
  statementId: string,
  parentStatementId: string,
  role: JoinRole = 'activist',
): Promise<ToggleJoiningResult> {
  const field: 'joined' | 'organizers' = role === 'organizer' ? 'organizers' : 'joined';

  try {
    const creator = buildCreator();
    if (!creator) throw new Error('User not authenticated');

    const statementRef = doc(db, Collections.statements, statementId);
    let leftStatementId: string | undefined;
    let leftStatementTitle: string | undefined;

    let singleJoinOnly = false;
    if (role === 'activist' && parentStatementId) {
      const parentDoc = await getDoc(doc(db, Collections.statements, parentStatementId));
      if (parentDoc.exists()) {
        const parent = parentDoc.data() as Statement;
        singleJoinOnly = parent?.statementSettings?.singleJoinOnly ?? false;
      }
    }

    await runTransaction(db, async (transaction) => {
      const statementDB = await transaction.get(statementRef);
      if (!statementDB.exists()) throw new Error('Statement does not exist');

      const statement = statementDB.data() as Statement;
      const otherField: 'joined' | 'organizers' = field === 'joined' ? 'organizers' : 'joined';
      const currentMembers: Creator[] =
        (field === 'organizers' ? statement.organizers : statement.joined) ?? [];
      const currentOthers: Creator[] =
        (otherField === 'organizers' ? statement.organizers : statement.joined) ?? [];

      const isUserMember = currentMembers.some((u) => u.uid === creator.uid);

      if (isUserMember) {
        const updated = currentMembers.filter((u) => u.uid !== creator.uid);
        transaction.update(statementRef, { [field]: updated });

        return;
      }

      const updatePayload: Record<string, Creator[]> = {};
      const isUserInOther = currentOthers.some((u) => u.uid === creator.uid);
      if (isUserInOther) {
        updatePayload[otherField] = currentOthers.filter((u) => u.uid !== creator.uid);
      }

      if (role === 'activist' && singleJoinOnly && parentStatementId) {
        const siblingsQuery = query(
          collection(db, Collections.statements),
          where('parentId', '==', parentStatementId),
          where('statementType', '==', StatementType.option),
        );
        const siblingsSnapshot = await getDocs(siblingsQuery);

        for (const siblingDoc of siblingsSnapshot.docs) {
          const sibling = siblingDoc.data() as Statement;
          if (sibling.statementId === statementId) continue;

          const isJoinedToSibling = sibling.joined?.find(
            (u: Creator) => u.uid === creator.uid,
          );
          if (isJoinedToSibling) {
            const siblingRef = doc(db, Collections.statements, sibling.statementId);
            const updatedSiblingJoined =
              sibling.joined?.filter((u: Creator) => u.uid !== creator.uid) ?? [];
            transaction.update(siblingRef, { joined: updatedSiblingJoined });

            leftStatementId = sibling.statementId;
            leftStatementTitle = sibling.statement;
          }
        }
      }

      updatePayload[field] = [...currentMembers, creator];
      transaction.update(statementRef, updatePayload);
    });

    return { success: true, leftStatementId, leftStatementTitle };
  } catch (error) {
    console.error('[Join] toggleJoining failed:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle joining',
    };
  }
}

export async function hasJoinFormSubmission(questionId: string, userId: string): Promise<boolean> {
  const key = `${questionId}_${userId}`;
  if (joinFormSubmitted.has(key)) return true;

  const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
  const snap = await getDoc(submissionRef);
  if (snap.exists()) {
    joinFormSubmitted.add(key);

    return true;
  }

  return false;
}

export async function saveJoinFormSubmission(
  questionId: string,
  userId: string,
  displayName: string,
  values: Record<string, string>,
): Promise<void> {
  const now = Date.now();
  const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
  await setDoc(submissionRef, {
    userId,
    questionId,
    displayName,
    values,
    createdAt: now,
    lastUpdate: now,
  }, { merge: true });

  joinFormSubmitted.add(`${questionId}_${userId}`);
}
