/**
 * Topic-grouped deliberation results export.
 *
 * Reads either a local JSON snapshot (produced by `exportProdQuestion.ts`)
 * or a live Firestore project, groups surviving solutions by topic, surfaces
 * agreement signals, and writes a single ResultsExport JSON.
 *
 * See plans/topic-grouped-results-export.md for the schema rationale.
 *
 * USAGE
 *   # From a local snapshot (preferred for development)
 *   npx tsx scripts/exportQuestionResults.ts \
 *     --input test-data/wizcol-e4Rvr.json \
 *     --out out/results-e4Rvr.json
 *
 *   # From production Firestore (read-only)
 *   gcloud auth application-default login
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/exportQuestionResults.ts \
 *     --question-id e4RvrhcOzPNt \
 *     --out out/results-e4Rvr.json
 *
 * FLAGS
 *   --input <path>            Local JSON snapshot to load instead of hitting Firestore
 *   --question-id <id>        Firestore question id (requires GCLOUD_PROJECT)
 *   --out <path>              Output file path (default: stdout)
 *   --consensus-floor <n>     Standalone consensus floor, default 0.35
 *   --min-evaluators <n>      Minimum evaluators per standalone, default 2
 *   --framing-id <id>         Override which topic framing to group by
 *   --include-filtered-ids    Include the full filtered-out IDs list (off by default)
 *   --pretty                  Pretty-print JSON output (default: true)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

// Type-only imports work cross-package; runtime values from
// @freedi/shared-types are inlined below to side-step the package's
// dist-ESM extension issue when running under Node ESM.
import type {
  AgreementHistogram,
  AgreementShape,
  CoalitionEntry,
  FilteredOutBlock,
  ResultsExport,
  ResultsExportMeta,
  SolutionEvaluationStats,
  StandaloneSolutionEntry,
  SynthesizedSolutionEntry,
  TopicAgreement,
  TopicBlock,
} from "../packages/shared-types/src/models/results-export/ResultsExport";

// ----------------------------------------------------------------------
// WizCol consensus math (mirrored from
// packages/shared-types/src/utils/consensusCalculation.ts).
// Keep in sync if the canonical formula changes.
// ----------------------------------------------------------------------

const RESULTS_EXPORT_SCHEMA_VERSION = "1.0.0";
const BAYESIAN_PRIOR_K = 2;
const Z_ALPHA_005 = 1.645;
const T_CRITICAL_TABLE: Record<number, number> = {
  1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015,
  6: 1.943, 7: 1.895, 8: 1.860, 9: 1.833, 10: 1.812,
  11: 1.796, 12: 1.782, 13: 1.771, 14: 1.761, 15: 1.753,
  16: 1.746, 17: 1.740, 18: 1.734, 19: 1.729, 20: 1.725,
  25: 1.708, 30: 1.697, 40: 1.684, 50: 1.676, 60: 1.671,
  80: 1.664, 100: 1.660, 120: 1.658,
};
const DF_KEYS = Object.keys(T_CRITICAL_TABLE).map(Number).sort((a, b) => a - b);

function tCritical(df: number): number {
  if (df <= 0 || df >= 120) return Z_ALPHA_005;
  if (T_CRITICAL_TABLE[df] !== undefined) return T_CRITICAL_TABLE[df];
  let lower = DF_KEYS[0];
  let upper = DF_KEYS[DF_KEYS.length - 1];
  for (let i = 0; i < DF_KEYS.length - 1; i++) {
    if (DF_KEYS[i] <= df && DF_KEYS[i + 1] >= df) {
      lower = DF_KEYS[i];
      upper = DF_KEYS[i + 1];
      break;
    }
  }
  const fraction = (df - lower) / (upper - lower);
  return T_CRITICAL_TABLE[lower] + fraction * (T_CRITICAL_TABLE[upper] - T_CRITICAL_TABLE[lower]);
}

function calcSmoothedSEM(
  _sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  const n = numberOfEvaluators;
  if (n <= 0) return 1;
  const k = BAYESIAN_PRIOR_K;
  const denomDf = n + k - 1;
  const variance = sumSquaredEvaluations / denomDf;
  const stdDev = Math.sqrt(Math.max(0, variance));
  return stdDev / Math.sqrt(n + k);
}

function calcAgreement(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators === 0) return 0;
  const n = numberOfEvaluators;
  const k = BAYESIAN_PRIOR_K;
  const mean = sumEvaluations / n;
  const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, n);
  const t = tCritical(n + k - 1);
  const penalty = t * sem;
  const availableRange = mean + 1;
  return mean - Math.min(penalty, availableRange);
}

function calcAgreementIndex(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators <= 0) return 0;
  const n = numberOfEvaluators;
  const k = BAYESIAN_PRIOR_K;
  const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, n);
  const t = tCritical(n + k - 1);
  return Math.max(0, Math.min(1, 1 - t * sem));
}

function calcLikeMindedness(
  sumEvaluations: number,
  sumSquaredEvaluations: number,
  numberOfEvaluators: number,
): number {
  if (numberOfEvaluators <= 0) return 0;
  const sem = calcSmoothedSEM(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);
  return Math.max(0, Math.min(1, 1 - sem));
}

function calcMeanSentiment(sumEvaluations: number, numberOfEvaluators: number): number {
  if (numberOfEvaluators <= 0) return 0;
  return sumEvaluations / numberOfEvaluators;
}

// ----------------------------------------------------------------------
// CLI args
// ----------------------------------------------------------------------

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const inputPath = getArg("--input");
const questionIdArg = getArg("--question-id");
const outPath = getArg("--out");
const consensusFloor = Number(getArg("--consensus-floor") ?? "0.35");
const minEvaluators = Number(getArg("--min-evaluators") ?? "2");
const framingIdOverride = getArg("--framing-id");
const includeFilteredIds = hasFlag("--include-filtered-ids");
const pretty = !hasFlag("--no-pretty");

if (!inputPath && !questionIdArg) {
  console.error(
    "Provide either --input <local.json> or --question-id <id> (with GCLOUD_PROJECT set).",
  );
  process.exit(1);
}

const LOW_SIGNAL_EVAL_THRESHOLD = 5;

// ----------------------------------------------------------------------
// Source-data shape (matches exportProdQuestion.ts output + Firestore)
// ----------------------------------------------------------------------

interface SourceEvaluation {
  evaluationId?: string;
  statementId: string;
  parentId?: string;
  evaluatorId: string;
  evaluation: number;
  createdAt?: number;
  lastUpdate?: number;
}

interface CachedEvaluationAggregate {
  sumEvaluations?: number;
  sumSquaredEvaluations?: number;
  numberOfEvaluators?: number;
  averageEvaluation?: number;
  agreement?: number;
  agreementIndex?: number;
  likeMindedness?: number;
  numberOfProEvaluators?: number;
  numberOfConEvaluators?: number;
  sumPro?: number;
  sumCon?: number;
}

interface SourceStatement {
  statementId: string;
  parentId?: string;
  topParentId?: string;
  statementType?: string;
  statement?: string;
  description?: string;
  paragraphs?: Array<{ content?: string; order?: number }>;
  hide?: boolean;
  isCluster?: boolean;
  isFraming?: boolean;
  derivedByPipeline?: string;
  framingClusters?: Record<string, string>;
  framingId?: string;
  integratedOptions?: string[];
  consensus?: number;
  numberOfMembers?: number;
  numberOfEvaluators?: number;
  totalEvaluators?: number;
  evaluation?: CachedEvaluationAggregate;
  creatorId?: string;
}

interface SourceClusterAggregation {
  id?: string;
  clusterId: string;
  framingId: string;
  parentStatementId: string;
  uniqueEvaluatorCount?: number;
  averageClusterConsensus?: number;
}

interface LoadedData {
  meta: ResultsExportMeta;
  question: SourceStatement;
  statements: SourceStatement[];
  evaluations: SourceEvaluation[];
  clusterAggregations: SourceClusterAggregation[];
}

// ----------------------------------------------------------------------
// Loaders
// ----------------------------------------------------------------------

function loadFromLocalJson(path: string): LoadedData {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as {
    meta?: { sourceProjectId?: string; questionId?: string };
    question: SourceStatement;
    statements: SourceStatement[];
    evaluations: SourceEvaluation[];
    clusterAggregations?: SourceClusterAggregation[];
  };

  if (!raw.question || !raw.statements || !raw.evaluations) {
    throw new Error(
      `Invalid input: ${path}. Expected fields: question, statements, evaluations.`,
    );
  }

  return {
    meta: {
      schemaVersion: RESULTS_EXPORT_SCHEMA_VERSION,
      source: "json-snapshot",
      sourceProjectId: raw.meta?.sourceProjectId,
      sourceFile: path,
    },
    question: raw.question,
    statements: raw.statements,
    evaluations: raw.evaluations,
    clusterAggregations: raw.clusterAggregations ?? [],
  };
}

async function loadFromFirestore(questionId: string): Promise<LoadedData> {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      "Set GCLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT) and run `gcloud auth application-default login` before using --question-id.",
    );
  }

  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  if (getApps().length === 0) initializeApp({ projectId });
  const db = getFirestore();

  const qDoc = await db.collection("statements").doc(questionId).get();
  if (!qDoc.exists) throw new Error(`Question ${questionId} not found in ${projectId}`);
  const question = { ...(qDoc.data() as Record<string, unknown>), statementId: questionId } as SourceStatement;

  const descSnap = await db.collection("statements").where("topParentId", "==", questionId).get();
  const statements: SourceStatement[] = [question];
  descSnap.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    statements.push({ ...data, statementId: doc.id } as SourceStatement);
  });

  // Evaluations — chunked `parentId in [...]`
  const parentIds = statements.map((s) => s.statementId);
  const evaluations: SourceEvaluation[] = [];
  for (let i = 0; i < parentIds.length; i += 30) {
    const slice = parentIds.slice(i, i + 30);
    const snap = await db.collection("evaluations").where("parentId", "in", slice).get();
    snap.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      evaluations.push({ ...data, evaluationId: doc.id } as SourceEvaluation);
    });
  }

  // Cluster aggregations — full scan, filter by parentStatementId == questionId
  const clusterAggregations: SourceClusterAggregation[] = [];
  const aggSnap = await db.collection("clusterAggregations").get();
  aggSnap.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (data.parentStatementId === questionId) {
      clusterAggregations.push({ ...data, id: doc.id } as SourceClusterAggregation);
    }
  });

  return {
    meta: {
      schemaVersion: RESULTS_EXPORT_SCHEMA_VERSION,
      source: "production",
      sourceProjectId: projectId,
    },
    question,
    statements,
    evaluations,
    clusterAggregations,
  };
}

// ----------------------------------------------------------------------
// Indexes & helpers
// ----------------------------------------------------------------------

interface Indexes {
  statementsById: Map<string, SourceStatement>;
  evaluationsByStatementId: Map<string, SourceEvaluation[]>;
  /** All evaluations the user submitted for any option in this question. */
  evaluationsByEvaluator: Map<string, SourceEvaluation[]>;
  uniqueEvaluators: Set<string>;
}

function buildIndexes(data: LoadedData): Indexes {
  const statementsById = new Map<string, SourceStatement>();
  for (const s of data.statements) statementsById.set(s.statementId, s);

  const evaluationsByStatementId = new Map<string, SourceEvaluation[]>();
  const evaluationsByEvaluator = new Map<string, SourceEvaluation[]>();
  const uniqueEvaluators = new Set<string>();

  for (const e of data.evaluations) {
    if (!evaluationsByStatementId.has(e.statementId)) {
      evaluationsByStatementId.set(e.statementId, []);
    }
    evaluationsByStatementId.get(e.statementId)!.push(e);

    if (!evaluationsByEvaluator.has(e.evaluatorId)) {
      evaluationsByEvaluator.set(e.evaluatorId, []);
    }
    evaluationsByEvaluator.get(e.evaluatorId)!.push(e);
    uniqueEvaluators.add(e.evaluatorId);
  }

  return { statementsById, evaluationsByStatementId, evaluationsByEvaluator, uniqueEvaluators };
}

/**
 * For a topic cluster, produce one effective evaluation per evaluator by
 * averaging that evaluator's votes across the cluster's member options.
 * This mirrors how the platform de-duplicates evaluators inside a cluster.
 */
function effectiveClusterEvaluations(
  cluster: SourceStatement,
  indexes: Indexes,
): number[] {
  const memberIds = cluster.integratedOptions ?? [];
  const byEvaluator = new Map<string, number[]>();
  for (const mid of memberIds) {
    const evals = indexes.evaluationsByStatementId.get(mid) ?? [];
    for (const e of evals) {
      if (!byEvaluator.has(e.evaluatorId)) byEvaluator.set(e.evaluatorId, []);
      byEvaluator.get(e.evaluatorId)!.push(e.evaluation);
    }
  }
  const result: number[] = [];
  for (const vals of byEvaluator.values()) {
    if (vals.length === 0) continue;
    let sum = 0;
    for (const v of vals) sum += v;
    result.push(sum / vals.length);
  }
  return result;
}

// ----------------------------------------------------------------------
// Per-solution agreement computation
// ----------------------------------------------------------------------

interface SolutionAggregate {
  evals: number[];                      // raw per-evaluator effective evaluations
  stats: SolutionEvaluationStats;
}

function aggregateFromValues(values: number[]): SolutionAggregate {
  let sum = 0;
  let sumSq = 0;
  let pro = 0;
  for (const v of values) {
    sum += v;
    sumSq += v * v;
    if (v > 0) pro++;
  }
  const n = values.length;
  const consensus = calcAgreement(sum, sumSq, n);
  const agreementIndex = calcAgreementIndex(sum, sumSq, n);
  const likeMindedness = calcLikeMindedness(sum, sumSq, n);
  const averageEvaluation = calcMeanSentiment(sum, n);
  const proRatio = n > 0 ? pro / n : 0;

  return {
    evals: values,
    stats: {
      numberOfEvaluators: n,
      averageEvaluation,
      consensus,
      agreementIndex,
      likeMindedness,
      proRatio,
      polarization: 1 - likeMindedness,
    },
  };
}

function buildHistogram(values: number[]): AgreementHistogram {
  const buckets = {
    stronglyAgree: 0,
    weaklyAgree: 0,
    neutral: 0,
    weaklyDisagree: 0,
    stronglyDisagree: 0,
  };
  for (const v of values) {
    if (v >= 0.6) buckets.stronglyAgree++;
    else if (v > 0) buckets.weaklyAgree++;
    else if (v === 0) buckets.neutral++;
    else if (v > -0.6) buckets.weaklyDisagree++;
    else buckets.stronglyDisagree++;
  }
  const n = values.length;
  let shape: AgreementShape;
  if (n < LOW_SIGNAL_EVAL_THRESHOLD) {
    shape = "low-signal";
  } else {
    const positive = buckets.stronglyAgree + buckets.weaklyAgree;
    const polarization = 1 - calcLikeMindedness(
      values.reduce((s, v) => s + v, 0),
      values.reduce((s, v) => s + v * v, 0),
      n,
    );
    const stronglyAgreeShare = buckets.stronglyAgree / n;
    const stronglyDisagreeShare = buckets.stronglyDisagree / n;
    if (stronglyAgreeShare >= 0.2 && stronglyDisagreeShare >= 0.2) {
      shape = "polarized";
    } else if (
      buckets.weaklyAgree / n >= 0.25 &&
      buckets.weaklyDisagree / n >= 0.25
    ) {
      shape = "split";
    } else if (positive / n >= 0.7 && polarization < 0.25) {
      shape = "consensus";
    } else {
      shape = "skewed-positive";
    }
  }
  return {
    stronglyAgreeCount: buckets.stronglyAgree,
    weaklyAgreeCount: buckets.weaklyAgree,
    neutralCount: buckets.neutral,
    weaklyDisagreeCount: buckets.weaklyDisagree,
    stronglyDisagreeCount: buckets.stronglyDisagree,
    agreementShape: shape,
  };
}

// ----------------------------------------------------------------------
// Topic resolution
// ----------------------------------------------------------------------

interface TopicResolution {
  framingId: string;
  /** topicId (cluster id) → list of option ids assigned to it (highest-weight only). */
  optionsByTopic: Map<string, string[]>;
  /** option id → all topic ids it was assigned to. */
  topicsByOption: Map<string, string[]>;
  /** topicId → cluster doc (the cluster IS the topic in topic-cluster). */
  clusterByTopic: Map<string, SourceStatement>;
  /** options assigned to no topic at all. */
  unassigned: string[];
}

function pickFramingId(
  data: LoadedData,
  options: SourceStatement[],
  override: string | undefined,
): string | undefined {
  if (override) return override;
  const counts = new Map<string, number>();
  for (const opt of options) {
    if (!opt.framingClusters) continue;
    for (const fid of Object.keys(opt.framingClusters)) {
      counts.set(fid, (counts.get(fid) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return undefined;
  // Most-used framing wins (proxy for "the active topic taxonomy").
  let best: string | undefined;
  let bestCount = -1;
  for (const [fid, c] of counts) {
    if (c > bestCount) {
      best = fid;
      bestCount = c;
    }
  }
  return best;
}

function resolveTopics(
  options: SourceStatement[],
  framingId: string,
  indexes: Indexes,
): TopicResolution {
  const optionsByTopic = new Map<string, string[]>();
  const topicsByOption = new Map<string, string[]>();
  const clusterByTopic = new Map<string, SourceStatement>();
  const unassigned: string[] = [];

  for (const opt of options) {
    const map = opt.framingClusters;
    if (!map) {
      unassigned.push(opt.statementId);
      continue;
    }
    const clusterId = map[framingId];
    if (!clusterId) {
      unassigned.push(opt.statementId);
      continue;
    }
    if (!optionsByTopic.has(clusterId)) optionsByTopic.set(clusterId, []);
    optionsByTopic.get(clusterId)!.push(opt.statementId);
    topicsByOption.set(opt.statementId, [clusterId]);
    if (!clusterByTopic.has(clusterId)) {
      const cluster = indexes.statementsById.get(clusterId);
      if (cluster) clusterByTopic.set(clusterId, cluster);
    }
  }

  return { framingId, optionsByTopic, topicsByOption, clusterByTopic, unassigned };
}

// ----------------------------------------------------------------------
// Solution entry builders
// ----------------------------------------------------------------------

function paragraphsOf(s: SourceStatement): string[] | undefined {
  if (!s.paragraphs || s.paragraphs.length === 0) return undefined;
  const sorted = [...s.paragraphs].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const out: string[] = [];
  for (const p of sorted) {
    if (p?.content) out.push(p.content);
  }
  return out.length > 0 ? out : undefined;
}

function buildSynthesizedEntry(
  cluster: SourceStatement,
  indexes: Indexes,
): SynthesizedSolutionEntry {
  const effective = effectiveClusterEvaluations(cluster, indexes);
  const agg = aggregateFromValues(effective);
  const histogram = buildHistogram(effective);

  const sourceIds = cluster.integratedOptions ?? [];
  const sourceTitles = sourceIds
    .slice(0, 8)
    .map((id) => indexes.statementsById.get(id)?.statement)
    .filter((t): t is string => Boolean(t));

  const pipeline =
    cluster.derivedByPipeline === "synthesis"
      ? "synthesis"
      : cluster.derivedByPipeline === "topic-cluster"
        ? "topic-cluster"
        : "unknown-cluster";

  return {
    solutionId: cluster.statementId,
    kind: "synthesis",
    derivedByPipeline: pipeline,
    title: cluster.statement ?? "(untitled cluster)",
    description: cluster.description || undefined,
    paragraphs: paragraphsOf(cluster),
    provenance: {
      sourceCount: sourceIds.length,
      sourceIds,
      sourceTitles,
    },
    evaluation: agg.stats,
    agreementProfile: histogram,
  };
}

function buildStandaloneEntry(
  option: SourceStatement,
  indexes: Indexes,
  rank: number,
): StandaloneSolutionEntry {
  const evals = (indexes.evaluationsByStatementId.get(option.statementId) ?? []).map(
    (e) => e.evaluation,
  );
  const agg = aggregateFromValues(evals);
  const histogram = buildHistogram(evals);

  return {
    solutionId: option.statementId,
    kind: "standalone",
    title: option.statement ?? "(untitled)",
    description: option.description || undefined,
    paragraphs: paragraphsOf(option),
    evaluation: agg.stats,
    agreementProfile: histogram,
    kept: {
      reason: `consensus ${agg.stats.consensus.toFixed(3)} >= floor ${consensusFloor}`,
      rank,
    },
  };
}

// ----------------------------------------------------------------------
// Topic + question aggregation
// ----------------------------------------------------------------------

function topicAgreement(
  synth: SynthesizedSolutionEntry[],
  standalones: StandaloneSolutionEntry[],
  topicMemberIds: string[],
  indexes: Indexes,
): TopicAgreement {
  const all: SolutionEvaluationStats[] = [
    ...synth.map((s) => s.evaluation),
    ...standalones.map((s) => s.evaluation),
  ];

  if (all.length === 0) {
    return {
      averageConsensus: 0,
      averageLikeMindedness: 0,
      internalDivergence: 0,
      evaluatorOverlap: 0,
    };
  }

  const meanConsensus =
    all.reduce((s, e) => s + e.consensus, 0) / all.length;
  const meanLM =
    all.reduce((s, e) => s + e.likeMindedness, 0) / all.length;
  const variance =
    all.reduce((s, e) => s + (e.consensus - meanConsensus) ** 2, 0) /
    Math.max(1, all.length - 1);
  const internalDivergence = Math.sqrt(variance);

  // evaluatorOverlap: fraction of users (touching this topic) who evaluated >=2 of its options.
  const evaluatorCounts = new Map<string, number>();
  for (const id of topicMemberIds) {
    const evs = indexes.evaluationsByStatementId.get(id) ?? [];
    const seen = new Set<string>();
    for (const e of evs) {
      if (seen.has(e.evaluatorId)) continue;
      seen.add(e.evaluatorId);
      evaluatorCounts.set(
        e.evaluatorId,
        (evaluatorCounts.get(e.evaluatorId) ?? 0) + 1,
      );
    }
  }
  const totalEvaluators = evaluatorCounts.size;
  const overlapping = [...evaluatorCounts.values()].filter((n) => n >= 2).length;
  const evaluatorOverlap = totalEvaluators > 0 ? overlapping / totalEvaluators : 0;

  return {
    averageConsensus: meanConsensus,
    averageLikeMindedness: meanLM,
    internalDivergence,
    evaluatorOverlap,
  };
}

// ----------------------------------------------------------------------
// Main pipeline
// ----------------------------------------------------------------------

async function buildExport(): Promise<ResultsExport> {
  const data = inputPath
    ? loadFromLocalJson(inputPath)
    : await loadFromFirestore(questionIdArg!);

  const indexes = buildIndexes(data);

  // 1. Identify the question + its surviving options + clusters.
  const questionId = data.question.statementId;
  const childrenOfQuestion = data.statements.filter(
    (s) => s.parentId === questionId && s.statementId !== questionId,
  );
  const visibleOptions = childrenOfQuestion.filter(
    (s) => s.statementType === "option" && s.hide !== true && !s.isCluster,
  );
  const clustersUnderQuestion = childrenOfQuestion.filter(
    (s) => s.isCluster === true,
  );
  const hiddenCount = childrenOfQuestion.filter(
    (s) => s.statementType === "option" && s.hide === true,
  ).length;

  // 2. Resolve framing + per-option topic assignment.
  const framingId = pickFramingId(data, visibleOptions, framingIdOverride);
  const topicResolution: TopicResolution = framingId
    ? resolveTopics(visibleOptions, framingId, indexes)
    : {
        framingId: "",
        optionsByTopic: new Map(),
        topicsByOption: new Map(),
        clusterByTopic: new Map(),
        unassigned: visibleOptions.map((o) => o.statementId),
      };

  // 3. Build per-topic blocks.
  const topics: TopicBlock[] = [];
  let totalSynthCount = 0;
  let totalAboveFloor = 0;
  let belowFloorCount = 0;
  let lowEvaluatorsCount = 0;

  for (const [topicId, memberIds] of topicResolution.optionsByTopic) {
    const cluster = topicResolution.clusterByTopic.get(topicId);

    // All clusters under topic-cluster framing become synthesized solutions in v1.
    const synthesized: SynthesizedSolutionEntry[] = cluster
      ? [buildSynthesizedEntry(cluster, indexes)]
      : [];

    // Standalones: topic members that survive the floor.
    const memberOptions = memberIds
      .map((id) => indexes.statementsById.get(id))
      .filter((s): s is SourceStatement => Boolean(s));

    const standalonesScored = memberOptions.map((opt) => {
      const evals = (indexes.evaluationsByStatementId.get(opt.statementId) ?? [])
        .map((e) => e.evaluation);
      const agg = aggregateFromValues(evals);
      return { opt, agg };
    });

    standalonesScored.sort((a, b) => b.agg.stats.consensus - a.agg.stats.consensus);

    const survivors: StandaloneSolutionEntry[] = [];
    let rank = 1;
    for (const { opt, agg } of standalonesScored) {
      if (agg.stats.numberOfEvaluators < minEvaluators) {
        lowEvaluatorsCount++;
        continue;
      }
      if (agg.stats.consensus < consensusFloor) {
        belowFloorCount++;
        continue;
      }
      survivors.push(buildStandaloneEntry(opt, indexes, rank++));
    }

    totalSynthCount += synthesized.length;
    totalAboveFloor += survivors.length;

    const topicAgreementBlock = topicAgreement(
      synthesized,
      survivors,
      memberIds,
      indexes,
    );

    topics.push({
      topicId,
      topicTitle: cluster?.statement ?? "(unknown topic)",
      topicDescription: cluster?.description || undefined,
      memberCount: memberIds.length,
      displayedCount: synthesized.length + survivors.length,
      agreement: topicAgreementBlock,
      synthesizedSolutions: synthesized,
      standaloneSolutions: survivors,
    });
  }

  // 4. Sort topics by descending displayedCount, then by averageConsensus.
  topics.sort((a, b) => {
    if (b.displayedCount !== a.displayedCount) return b.displayedCount - a.displayedCount;
    return b.agreement.averageConsensus - a.agreement.averageConsensus;
  });

  // 5. Question-level summary + agreement.
  const allSurvivors = topics.flatMap((t) => [
    ...t.synthesizedSolutions,
    ...t.standaloneSolutions,
  ]);
  const meanConsensus =
    allSurvivors.length > 0
      ? allSurvivors.reduce((s, e) => s + e.evaluation.consensus, 0) / allSurvivors.length
      : 0;
  const meanLikeMindedness =
    allSurvivors.length > 0
      ? allSurvivors.reduce((s, e) => s + e.evaluation.likeMindedness, 0) /
        allSurvivors.length
      : 0;

  const evaluatorEngagement =
    indexes.uniqueEvaluators.size > 0
      ? data.evaluations.length / indexes.uniqueEvaluators.size
      : 0;

  const filteredOut: FilteredOutBlock = {
    count: belowFloorCount + lowEvaluatorsCount + hiddenCount + topicResolution.unassigned.length,
    byReason: {
      belowConsensusFloor: belowFloorCount,
      lowEvaluators: lowEvaluatorsCount,
      hidden: hiddenCount,
      unassigned: topicResolution.unassigned.length,
    },
  };

  const coalitions: CoalitionEntry[] = []; // Deferred to v2 per plan §10.

  const exportObj: ResultsExport = {
    meta: data.meta,
    questionId,
    questionTitle: data.question.statement ?? "(untitled question)",
    exportedAt: Date.now(),
    thresholds: {
      standaloneConsensusFloor: consensusFloor,
      minEvaluators,
      synthesisIncludesAll: true,
      lowSignalEvaluatorThreshold: LOW_SIGNAL_EVAL_THRESHOLD,
    },
    summary: {
      totalOptions: visibleOptions.length,
      totalEvaluators: indexes.uniqueEvaluators.size,
      topicCount: topics.length,
      synthesizedSolutionCount: totalSynthCount,
      standaloneAboveFloorCount: totalAboveFloor,
      filteredOutCount: filteredOut.count,
    },
    agreement: {
      questionLevel: {
        averageConsensus: meanConsensus,
        averageLikeMindedness: meanLikeMindedness,
        polarization: 1 - meanLikeMindedness,
        evaluatorEngagement,
      },
      coalitions,
    },
    topics,
    filteredOut,
  };

  if (includeFilteredIds) {
    // Caller asked for the long list — append at top level rather than mutate the type.
    (exportObj as unknown as { filteredOutIds?: string[] }).filteredOutIds = [
      ...topicResolution.unassigned,
    ];
  }

  return exportObj;
}

// ----------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------

(async () => {
  try {
    const result = await buildExport();
    const json = pretty
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(result);

    if (outPath) {
      const out = resolve(outPath);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, json, "utf-8");
      console.info(`Wrote ${out}`);
      console.info(
        `  ${result.summary.topicCount} topics, ` +
          `${result.summary.synthesizedSolutionCount} synthesized, ` +
          `${result.summary.standaloneAboveFloorCount} standalones above floor, ` +
          `${result.summary.filteredOutCount} filtered out.`,
      );
    } else {
      process.stdout.write(json + "\n");
    }
  } catch (err) {
    console.error("Export failed:", err);
    process.exit(1);
  }
})();
