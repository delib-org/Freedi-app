import { db, doc, getDoc, collection, getDocs, query, where, orderBy, setDoc, updateDoc } from './firebase';
import { getUserState } from './user';

/** Stage progression for the forward flow */
export type FlowStage = 'intro' | 'needs-write' | 'needs-evaluate' | 'solutions-write' | 'solutions-evaluate' | 'state' | 'done';

/** Deliberation settings */
export interface DeliberationSettings {
  timeEstimateMinutes: number;
  allowSkip: boolean;
  maxNeedsPerUser: number;
  maxSolutionsPerUser: number;
  evaluationsPerStage: number;
  includeNeeds: boolean;
  includeSolutions: boolean;
  requireSignIn: boolean;
  anonymousContributions: boolean;
  facilitatorName: string;
}

/** Deliberation document stored in Firestore */
export interface Deliberation {
  deliberationId: string;
  title: string;
  description: string;
  needsQuestionId: string;
  solutionsQuestionId: string;
  creatorId: string;
  createdAt: number;
  lastUpdate: number;
  settings: DeliberationSettings;
  participantCount: number;
}

/** Wizard state stored in sessionStorage between steps */
export interface WizardState {
  challengeText: string;
  title: string;
  description: string;
  includeNeeds: boolean;
  includeSolutions: boolean;
  maxNeeds: number;
  maxSolutions: number;
  maxEvaluations: number;
  seedNeeds: string[];
  seedSolutions: string[];
  requireSignIn: boolean;
  anonymousContributions: boolean;
  facilitatorName: string;
}

const WIZARD_KEY = 'flow_wizard_state';

/** Save wizard state to sessionStorage */
export function saveWizardState(state: WizardState): void {
  sessionStorage.setItem(WIZARD_KEY, JSON.stringify(state));
}

/** Load wizard state from sessionStorage */
export function loadWizardState(): WizardState | null {
  const raw = sessionStorage.getItem(WIZARD_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as WizardState;
}

/** Clear wizard state after creation */
export function clearWizardState(): void {
  sessionStorage.removeItem(WIZARD_KEY);
}

/** Create default wizard state */
export function createDefaultWizardState(): WizardState {
  return {
    challengeText: '',
    title: '',
    description: '',
    includeNeeds: true,
    includeSolutions: true,
    maxNeeds: 3,
    maxSolutions: 3,
    maxEvaluations: 10,
    seedNeeds: [],
    seedSolutions: [],
    requireSignIn: false,
    anonymousContributions: true,
    facilitatorName: '',
  };
}

/** Estimate time in minutes for the participant flow */
export function estimateTime(wizard: WizardState): number {
  let minutes = 1; // intro
  if (wizard.includeNeeds) {
    minutes += wizard.maxNeeds * 0.75;
    minutes += wizard.maxEvaluations * 0.25;
  }
  if (wizard.includeSolutions) {
    minutes += wizard.maxSolutions * 1;
    minutes += wizard.maxEvaluations * 0.25;
  }
  return Math.round(minutes);
}

/**
 * Create a deliberation in Firestore.
 * Creates the root statement + sub-question statements + seed statements.
 * Returns the deliberation ID.
 */
export async function createDeliberation(wizard: WizardState): Promise<string> {
  const { user } = getUserState();
  if (!user) throw new Error('User not authenticated');

  const now = Date.now();
  const statementsRef = collection(db, 'statements');

  // 1. Create root statement (the deliberation itself)
  const rootRef = doc(statementsRef);
  const deliberationId = rootRef.id;

  // 2. Create sub-question for needs
  const needsRef = doc(statementsRef);
  const needsQuestionId = needsRef.id;

  // 3. Create sub-question for solutions
  const solutionsRef = doc(statementsRef);
  const solutionsQuestionId = solutionsRef.id;

  const settings: DeliberationSettings = {
    timeEstimateMinutes: estimateTime(wizard),
    allowSkip: true,
    maxNeedsPerUser: wizard.maxNeeds,
    maxSolutionsPerUser: wizard.maxSolutions,
    evaluationsPerStage: wizard.maxEvaluations,
    includeNeeds: wizard.includeNeeds,
    includeSolutions: wizard.includeSolutions,
    requireSignIn: wizard.requireSignIn,
    anonymousContributions: wizard.anonymousContributions,
    facilitatorName: wizard.facilitatorName,
  };

  // Write root statement with deliberationConfig
  await setDoc(rootRef, {
    statementId: deliberationId,
    statement: wizard.title,
    description: wizard.description,
    parentId: 'top',
    topParentId: deliberationId,
    statementType: 'question',
    creatorId: user.uid,
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
    participantCount: 0,
    deliberationConfig: {
      needsQuestionId,
      solutionsQuestionId,
      settings,
    },
  });

  // Write needs sub-question
  await setDoc(needsRef, {
    statementId: needsQuestionId,
    statement: 'What are your needs?',
    description: '',
    parentId: deliberationId,
    topParentId: deliberationId,
    statementType: 'question',
    creatorId: user.uid,
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
  });

  // Write solutions sub-question
  await setDoc(solutionsRef, {
    statementId: solutionsQuestionId,
    statement: 'What is your solution?',
    description: '',
    parentId: deliberationId,
    topParentId: deliberationId,
    statementType: 'question',
    creatorId: user.uid,
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
  });

  // 4. Write seed needs
  for (const seedText of wizard.seedNeeds) {
    const seedRef = doc(statementsRef);
    await setDoc(seedRef, {
      statementId: seedRef.id,
      statement: seedText,
      parentId: needsQuestionId,
      topParentId: deliberationId,
      statementType: 'option',
      creatorId: user.uid,
      createdAt: now,
      lastUpdate: now,
      consensus: 0,
      isSeed: true,
    });
  }

  // 5. Write seed solutions
  for (const seedText of wizard.seedSolutions) {
    const seedRef = doc(statementsRef);
    await setDoc(seedRef, {
      statementId: seedRef.id,
      statement: seedText,
      parentId: solutionsQuestionId,
      topParentId: deliberationId,
      statementType: 'option',
      creatorId: user.uid,
      createdAt: now,
      lastUpdate: now,
      consensus: 0,
      isSeed: true,
    });
  }

  clearWizardState();
  return deliberationId;
}

/** Load deliberations created by the current user */
export async function loadMyDeliberations(): Promise<Deliberation[]> {
  const { user } = getUserState();
  if (!user) return [];

  const ref = collection(db, 'statements');
  const q = query(
    ref,
    where('creatorId', '==', user.uid),
    where('statementType', '==', 'question'),
    where('parentId', '==', 'top'),
    orderBy('createdAt', 'desc'),
  );

  const snap = await getDocs(q);
  const results: Deliberation[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    if (!data.deliberationConfig) continue;

    const cfg = data.deliberationConfig as {
      needsQuestionId: string;
      solutionsQuestionId: string;
      settings: DeliberationSettings;
    };

    results.push({
      deliberationId: data.statementId ?? d.id,
      title: data.statement ?? '',
      description: data.description ?? '',
      needsQuestionId: cfg.needsQuestionId,
      solutionsQuestionId: cfg.solutionsQuestionId,
      creatorId: data.creatorId ?? '',
      createdAt: data.createdAt ?? 0,
      lastUpdate: data.lastUpdate ?? 0,
      settings: cfg.settings,
      participantCount: data.participantCount ?? 0,
    });
  }

  return results;
}

/** Get all participated deliberation IDs from localStorage sessions */
export function getParticipatedIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(`${SESSION_KEY}_`)) {
      ids.push(key.replace(`${SESSION_KEY}_`, ''));
    }
  }
  return ids;
}

/** Session state for tracking user progress */
export interface SessionState {
  deliberationId: string;
  userId: string;
  currentStage: FlowStage;
  needsWritten: number;
  needsEvaluated: number;
  solutionsWritten: number;
  solutionsEvaluated: number;
  completedAt: number | null;
  lastVisit: number;
}

const SESSION_KEY = 'flow_session';

/**
 * Load deliberation data from Firestore.
 * Deliberations are stored in the `statements` collection (which has public
 * read access) with `statementType: 'deliberation'`.  The deliberation-specific
 * fields live inside a `deliberationConfig` sub-object.
 */
export async function loadDeliberation(deliberationId: string): Promise<Deliberation | null> {
  const ref = doc(db, 'statements', deliberationId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data();

  // The doc may be a plain statement — only treat it as a deliberation if it
  // carries the config object.
  if (!data.deliberationConfig) return null;

  const cfg = data.deliberationConfig as {
    needsQuestionId: string;
    solutionsQuestionId: string;
    settings: DeliberationSettings;
  };

  return {
    deliberationId: data.statementId ?? deliberationId,
    title: data.statement ?? '',
    description: data.description ?? '',
    needsQuestionId: cfg.needsQuestionId,
    solutionsQuestionId: cfg.solutionsQuestionId,
    creatorId: data.creatorId ?? '',
    createdAt: data.createdAt ?? 0,
    lastUpdate: data.lastUpdate ?? 0,
    settings: cfg.settings,
    participantCount: data.participantCount ?? 0,
  };
}

/** Load or create session state */
export function loadSession(deliberationId: string): SessionState | null {
  const raw = localStorage.getItem(`${SESSION_KEY}_${deliberationId}`);
  if (!raw) return null;

  return JSON.parse(raw) as SessionState;
}

/** Save session state to localStorage */
export function saveSession(session: SessionState): void {
  localStorage.setItem(`${SESSION_KEY}_${session.deliberationId}`, JSON.stringify(session));
}

/** Create a new session */
export function createSession(deliberationId: string): SessionState {
  const { user } = getUserState();
  const session: SessionState = {
    deliberationId,
    userId: user?.uid ?? 'anonymous',
    currentStage: 'intro',
    needsWritten: 0,
    needsEvaluated: 0,
    solutionsWritten: 0,
    solutionsEvaluated: 0,
    completedAt: null,
    lastVisit: Date.now(),
  };
  saveSession(session);
  return session;
}

/** Advance to next stage */
export function advanceStage(session: SessionState): FlowStage {
  const stages: FlowStage[] = [
    'intro',
    'needs-write',
    'needs-evaluate',
    'solutions-write',
    'solutions-evaluate',
    'state',
    'done',
  ];

  const currentIndex = stages.indexOf(session.currentStage);
  const nextIndex = Math.min(currentIndex + 1, stages.length - 1);
  session.currentStage = stages[nextIndex];
  session.lastVisit = Date.now();
  saveSession(session);
  return session.currentStage;
}

/** Load statements (needs or solutions) for a question */
export async function loadStatements(questionId: string): Promise<StatementData[]> {
  const ref = collection(db, 'statements');
  const q = query(
    ref,
    where('parentId', '==', questionId),
    where('statementType', '==', 'option'),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ statementId: d.id, ...d.data() }) as StatementData);
}

/** Minimal statement data used in this app */
export interface StatementData {
  statementId: string;
  statement: string;
  parentId: string;
  topParentId: string;
  statementType: string;
  creatorId: string;
  createdAt: number;
  lastUpdate: number;
  consensus: number;
  evaluation?: {
    sumEvaluations: number;
    numberOfEvaluators: number;
    agreement: number;
  };
}

/** Submit a new need or solution */
export async function submitStatement(
  questionId: string,
  topParentId: string,
  text: string,
): Promise<string> {
  const { user } = getUserState();
  if (!user) throw new Error('User not authenticated');

  const statementsRef = collection(db, 'statements');
  const newRef = doc(statementsRef);
  const now = Date.now();

  const statement: StatementData = {
    statementId: newRef.id,
    statement: text,
    parentId: questionId,
    topParentId,
    statementType: 'option',
    creatorId: user.uid,
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
  };

  await setDoc(newRef, statement);
  return newRef.id;
}

/** Submit an evaluation for a statement.
 *  Must match Firestore rules which require exact fields:
 *  evaluationId, parentId, statementId, evaluatorId, evaluation, updatedAt
 */
export async function submitEvaluation(
  statementId: string,
  parentId: string,
  value: number,
): Promise<void> {
  const { user } = getUserState();
  if (!user) throw new Error('User not authenticated');

  const evaluationId = `${user.uid}--${statementId}`;
  const evalRef = doc(db, 'evaluations', evaluationId);

  const data = {
    evaluationId,
    evaluatorId: user.uid,
    statementId,
    parentId,
    evaluation: value,
    updatedAt: Date.now(),
  };

  if (!navigator.onLine) {
    queueOfflineEvaluation(data);
    return;
  }

  await setDoc(evalRef, data);
}

// ---------------------------------------------------------------------------
// Comments & Suggestions — stored as statements under the target statement
// ---------------------------------------------------------------------------

/** Submit a comment on a statement */
export async function submitComment(
  targetStatementId: string,
  topParentId: string,
  text: string,
): Promise<string> {
  const { user } = getUserState();
  if (!user) throw new Error('User not authenticated');

  const statementsRef = collection(db, 'statements');
  const newRef = doc(statementsRef);
  const now = Date.now();

  await setDoc(newRef, {
    statementId: newRef.id,
    statement: text,
    parentId: targetStatementId,
    topParentId,
    statementType: 'comment',
    creatorId: user.uid,
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
  });

  return newRef.id;
}

/** Submit a suggested improvement for a statement */
export async function submitSuggestion(
  targetStatementId: string,
  topParentId: string,
  improvedText: string,
  reason: string,
): Promise<string> {
  const { user } = getUserState();
  if (!user) throw new Error('User not authenticated');

  const statementsRef = collection(db, 'statements');
  const newRef = doc(statementsRef);
  const now = Date.now();

  await setDoc(newRef, {
    statementId: newRef.id,
    statement: improvedText,
    parentId: targetStatementId,
    topParentId,
    statementType: 'suggestion',
    creatorId: user.uid,
    createdAt: now,
    lastUpdate: now,
    consensus: 0,
    suggestionReason: reason || '',
  });

  return newRef.id;
}

// ---------------------------------------------------------------------------
// Similarity — client-side word overlap (Jaccard index)
// ---------------------------------------------------------------------------

/** Compute Jaccard similarity between two texts (0–1) */
export function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a));
  const wordsB = new Set(normalizeText(b));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff\u0600-\u06ff\s]/g, '') // keep letters, numbers, Hebrew, Arabic
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip short words
}

/** Find statements similar to the given text */
export function findSimilar(
  text: string,
  statements: StatementData[],
  threshold = 0.3,
): Array<{ statement: StatementData; similarity: number }> {
  return statements
    .map((s) => ({ statement: s, similarity: textSimilarity(text, s.statement) }))
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

// ---------------------------------------------------------------------------
// Score Trends — track consensus changes between visits
// ---------------------------------------------------------------------------

const SCORES_KEY = 'flow_scores';

export interface ScoreSnapshot {
  [statementId: string]: number;
}

/** Load previously saved scores for a question */
export function loadScoreSnapshot(questionId: string): ScoreSnapshot {
  const raw = localStorage.getItem(`${SCORES_KEY}_${questionId}`);
  if (!raw) return {};
  return JSON.parse(raw) as ScoreSnapshot;
}

/** Save current scores for comparison on next visit */
export function saveScoreSnapshot(questionId: string, statements: StatementData[]): void {
  const snapshot: ScoreSnapshot = {};
  for (const s of statements) {
    snapshot[s.statementId] = s.consensus ?? 0;
  }
  localStorage.setItem(`${SCORES_KEY}_${questionId}`, JSON.stringify(snapshot));
}

/** Compute score trend: positive = improved, negative = declined, 0 = unchanged */
export function getScoreTrend(statementId: string, currentScore: number, snapshot: ScoreSnapshot): number {
  const previous = snapshot[statementId];
  if (previous === undefined) return 0;
  return currentScore - previous;
}

// ---------------------------------------------------------------------------
// Offline Queue — queue evaluations when offline, sync when back online
// ---------------------------------------------------------------------------

const OFFLINE_QUEUE_KEY = 'flow_offline_queue';

interface OfflineEvaluation {
  evaluationId: string;
  evaluatorId: string;
  statementId: string;
  parentId: string;
  evaluation: number;
  updatedAt: number;
}

function queueOfflineEvaluation(data: OfflineEvaluation): void {
  const queue = getOfflineQueue();
  queue.push(data);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineQueue(): OfflineEvaluation[] {
  const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as OfflineEvaluation[];
}

export function getOfflineQueueCount(): number {
  return getOfflineQueue().length;
}

/** Flush the offline queue — call when back online */
export async function syncOfflineQueue(): Promise<number> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const failed: OfflineEvaluation[] = [];

  for (const data of queue) {
    try {
      const evalRef = doc(db, 'evaluations', data.evaluationId);
      await setDoc(evalRef, data);
      synced++;
    } catch (error) {
      console.error('[OfflineSync] Failed to sync evaluation:', error);
      failed.push(data);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
  return synced;
}
