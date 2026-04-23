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
import { getUserState, ensureUser } from './user';
import { applyStatementLanguage } from './i18n';
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
let messageCounts: Map<string, number> = new Map();
let messageLatest: Map<string, number> = new Map();
let messagesByOption: Map<string, number[]> = new Map();
let messageCountsUnsubs: Unsubscribe[] = [];
/** Cluster-id → unique-evaluator count. Populated by `subscribeClusterLinks`. */
let clusterEvaluatorCounts: Map<string, number> = new Map();
let clusterLinksUnsubs: Unsubscribe[] = [];

const LAST_READ_KEY = 'freedi_join_last_read';
let joinFormSubmitted = new Set<string>();
// In-memory cache of the last-known submission role per (questionId, userId).
// Lets handleJoin decide optimistically whether to open the form without a
// Firestore read. Populated on successful saveJoinFormSubmission, and by
// getJoinFormSubmissionRole on its first fetch.
const joinFormSubmittedRole = new Map<string, JoinRole>();
let customDisplayName: string | null = null;

const DISPLAY_NAME_KEY = 'freedi_join_name_v2';
const VISITED_KEY = 'freedi_join_visited';

// Clear stale name from old key
try { localStorage.removeItem('freedi_join_display_name'); } catch { /* ignore */ }

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
  markOptionChatRead(optionId);
}

function getLastReadMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }

  return {};
}

function markOptionChatRead(optionId: string): void {
  try {
    const map = getLastReadMap();
    map[optionId] = Date.now();
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getNewMessageCount(optionId: string): number {
  const lastRead = getLastReadMap()[optionId];
  if (!lastRead) return messageCounts.get(optionId) ?? 0;

  const latest = messageLatest.get(optionId);
  if (!latest || latest <= lastRead) return 0;

  const allMsgs = messagesByOption.get(optionId);
  if (!allMsgs) return 0;

  return allMsgs.filter((ts) => ts > lastRead).length;
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
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch { /* ignore */ }
}

export function getCustomDisplayName(): string | null {
  if (customDisplayName) return customDisplayName;

  try {
    const stored = localStorage.getItem(DISPLAY_NAME_KEY);
    if (stored && stored.trim()) {
      customDisplayName = stored;

      return stored;
    }
  } catch { /* ignore */ }

  return null;
}

export function clearCustomDisplayName(): void {
  customDisplayName = null;
  try {
    localStorage.removeItem(DISPLAY_NAME_KEY);
  } catch { /* ignore */ }
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

export function getOptionById(optionId: string): Statement | undefined {
  return allOptions.find((o) => o.statementId === optionId);
}

export function getMessages(): Statement[] {
  return messages;
}

export function getVisibleOptions(): Statement[] {
  let opts = allOptions
    .filter((o) => o.joinStatus !== 'failed')
    .sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0));

  // Condensation: in "clusters-only" mode for the join surface, hide any
  // original that is represented by a cluster (identified via
  // `integratedOptions`). Originals remain live in Firestore — this is a
  // display filter only.
  const condensation = question?.statementSettings?.condensation;
  const visibility = condensation?.enabled === true
    ? (condensation.visibility?.join ?? 'clusters-only')
    : 'both';
  if (visibility === 'clusters-only') {
    const memberOf = new Set<string>();
    for (const o of allOptions) {
      if (o.isCluster === true && Array.isArray(o.integratedOptions)) {
        o.integratedOptions.forEach((id) => memberOf.add(id));
      }
    }
    opts = opts.filter((o) => o.isCluster === true || !memberOf.has(o.statementId));
  }

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

function syncQuestionLanguage(): void {
  if (!question) return;
  applyStatementLanguage(question.defaultLanguage, question.forceLanguage);
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
  syncQuestionLanguage();

  const optionsQuery = query(
    collection(db, Collections.statements),
    where('parentId', '==', questionId),
    where('statementType', '==', StatementType.option),
  );
  const optionsSnap = await getDocs(optionsQuery);
  allOptions = optionsSnap.docs.map((d) => d.data() as Statement);

  // Warm the join-form submission cache in the background so the modal opens
  // with the user's previous name/phone/email on their first click. Gated by
  // joinForm.enabled to avoid unnecessary reads.
  if (question.statementSettings?.joinForm?.enabled) {
    void prefetchJoinFormSubmission(questionId);
  }

  m.redraw();
}

async function prefetchJoinFormSubmission(questionId: string): Promise<void> {
  try {
    await ensureUser();
    const creator = getCreator();
    if (!creator) return;
    await getJoinFormSubmissionData(questionId, creator.uid);
    m.redraw();
  } catch {
    /* ignore — modal will still work, just without prefill */
  }
}

export function subscribeQuestion(questionId: string): Unsubscribe {
  return onSnapshot(doc(db, Collections.statements, questionId), (snap) => {
    if (snap.exists()) {
      question = snap.data() as Statement;
      syncQuestionLanguage();
    } else {
      question = null;
    }
    m.redraw();
  });
}

export function getMessageCount(optionId: string): number {
  return messageCounts.get(optionId) ?? 0;
}

export function subscribeOptions(questionId: string): Unsubscribe {
  const optionsQuery = query(
    collection(db, Collections.statements),
    where('parentId', '==', questionId),
    where('statementType', '==', StatementType.option),
  );

  return onSnapshot(optionsQuery, (snap) => {
    allOptions = snap.docs.map((d) => d.data() as Statement);
    subscribeMessageCounts(questionId);
    subscribeClusterLinks();
    m.redraw();
  });
}

/**
 * Subscribe to `clusterEvaluationLinks` for every currently-visible cluster,
 * so the card can show a counts-only breakdown ("Combined votes from N
 * evaluators"). Tears down prior subscriptions when the cluster set changes.
 */
function subscribeClusterLinks(): void {
  for (const unsub of clusterLinksUnsubs) unsub();
  clusterLinksUnsubs = [];
  clusterEvaluatorCounts = new Map();

  const clusterIds = allOptions
    .filter((o) => o.isCluster === true)
    .map((o) => o.statementId);
  if (clusterIds.length === 0) return;

  const BATCH = 30;
  for (let i = 0; i < clusterIds.length; i += BATCH) {
    const batch = clusterIds.slice(i, i + BATCH);
    const q = query(
      collection(db, Collections.clusterEvaluationLinks),
      where('clusterId', 'in', batch),
    );
    const unsub = onSnapshot(q, (snap) => {
      const counts = new Map<string, number>();
      snap.forEach((d) => {
        const link = d.data() as { clusterId?: string };
        if (link?.clusterId) {
          counts.set(link.clusterId, (counts.get(link.clusterId) ?? 0) + 1);
        }
      });
      // Merge into the outer map — other batches may own different clusters.
      for (const id of batch) {
        if (counts.has(id)) {
          clusterEvaluatorCounts.set(id, counts.get(id)!);
        } else {
          clusterEvaluatorCounts.delete(id);
        }
      }
      m.redraw();
    });
    clusterLinksUnsubs.push(unsub);
  }
}

export function getClusterEvaluatorCount(clusterId: string): number {
  return clusterEvaluatorCounts.get(clusterId) ?? 0;
}

function subscribeMessageCounts(_questionId: string): void {
  for (const unsub of messageCountsUnsubs) unsub();
  messageCountsUnsubs = [];

  const optionIds = allOptions.map((o) => o.statementId);
  if (optionIds.length === 0) return;

  const batchSize = 30;
  for (let i = 0; i < optionIds.length; i += batchSize) {
    const batch = optionIds.slice(i, i + batchSize);

    const chatQuery = query(
      collection(db, Collections.statements),
      where('parentId', 'in', batch),
      where('statementType', '==', StatementType.statement),
    );

    const unsub = onSnapshot(chatQuery, (snap) => {
      for (const id of batch) {
        messageCounts.delete(id);
        messageLatest.delete(id);
        messagesByOption.delete(id);
      }

      for (const d of snap.docs) {
        const data = d.data() as Statement;
        const pid = data.parentId;
        messageCounts.set(pid, (messageCounts.get(pid) ?? 0) + 1);

        const ts = data.createdAt ?? 0;
        const existing = messageLatest.get(pid) ?? 0;
        if (ts > existing) messageLatest.set(pid, ts);

        const arr = messagesByOption.get(pid) ?? [];
        arr.push(ts);
        messagesByOption.set(pid, arr);
      }
      m.redraw();
    });

    messageCountsUnsubs.push(unsub);
  }
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

/** Synchronous peek at the cached submission role — null if unknown locally. */
export function getCachedJoinFormSubmissionRole(
  questionId: string,
  userId: string,
): JoinRole | null {
  return joinFormSubmittedRole.get(`${questionId}_${userId}`) ?? null;
}

export interface JoinFormSubmissionData {
  role: JoinRole | null;
  displayName: string;
  values: Record<string, string>;
}

// In-memory cache of the full submission so repeated modal opens don't re-hit
// Firestore. Populated on every save and on getJoinFormSubmissionData fetch.
const joinFormSubmissionCache = new Map<string, JoinFormSubmissionData>();

export function getCachedJoinFormSubmissionData(
  questionId: string,
  userId: string,
): JoinFormSubmissionData | null {
  return joinFormSubmissionCache.get(`${questionId}_${userId}`) ?? null;
}

export async function getJoinFormSubmissionData(
  questionId: string,
  userId: string,
): Promise<JoinFormSubmissionData | null> {
  const key = `${questionId}_${userId}`;
  const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
  const snap = await getDoc(submissionRef);
  if (!snap.exists()) {
    joinFormSubmittedRole.delete(key);
    joinFormSubmissionCache.delete(key);

    return null;
  }
  const data = snap.data() as {
    role?: JoinRole;
    displayName?: string;
    values?: Record<string, string>;
  } | undefined;

  const submission: JoinFormSubmissionData = {
    role: data?.role ?? null,
    displayName: data?.displayName ?? '',
    values: data?.values ?? {},
  };
  if (submission.role) joinFormSubmittedRole.set(key, submission.role);
  joinFormSubmissionCache.set(key, submission);

  return submission;
}

/** Back-compat: legacy role-only lookup. Delegates to the full fetcher. */
export async function getJoinFormSubmissionRole(
  questionId: string,
  userId: string,
): Promise<JoinRole | null> {
  const submission = await getJoinFormSubmissionData(questionId, userId);

  return submission?.role ?? null;
}

export async function saveJoinFormSubmission(
  questionId: string,
  userId: string,
  displayName: string,
  values: Record<string, string>,
  role: JoinRole = 'activist',
  optionId?: string,
  optionTitle?: string,
): Promise<void> {
  const now = Date.now();
  const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
  // Reset syncedToSheet so the onDocumentWritten trigger appends a fresh row
  // for this (possibly role-changed) submission.
  await setDoc(submissionRef, {
    userId,
    questionId,
    displayName,
    values,
    role,
    optionId: optionId ?? '',
    optionTitle: optionTitle ?? '',
    createdAt: now,
    lastUpdate: now,
    syncedToSheet: false,
  }, { merge: true });

  const key = `${questionId}_${userId}`;
  joinFormSubmitted.add(key);
  joinFormSubmittedRole.set(key, role);
  joinFormSubmissionCache.set(key, { role, displayName, values });
}
