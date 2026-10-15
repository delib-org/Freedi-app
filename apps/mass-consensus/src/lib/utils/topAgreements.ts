/**
 * Pure helpers for the admin "Top agreements" panel.
 * Ranks options the same way the public results page does:
 * evaluation.agreement first, legacy `consensus` as fallback.
 */

import { Statement } from '@freedi/shared-types';

export interface TopAgreementRow {
  statementId: string;
  statement: string;
  /** Consensus score, -1..1 */
  consensus: number;
  numberOfEvaluators: number;
}

export interface QuestionTopAgreements {
  statementId: string;
  statement: string;
  options: TopAgreementRow[];
}

export function getConsensusScore(statement: Statement): number {
  return statement.evaluation?.agreement ?? statement.consensus ?? 0;
}

/**
 * Map statements to slim rows sorted by consensus (highest first),
 * ties broken by more evaluators. Hidden statements are dropped.
 */
export function selectTopAgreements(statements: Statement[], limit: number): TopAgreementRow[] {
  return statements
    .filter((s) => !s.hide)
    .map((s) => ({
      statementId: s.statementId,
      statement: s.statement,
      consensus: getConsensusScore(s),
      numberOfEvaluators: s.evaluation?.numberOfEvaluators ?? 0,
    }))
    .sort((a, b) => b.consensus - a.consensus || b.numberOfEvaluators - a.numberOfEvaluators)
    .slice(0, Math.max(0, limit));
}

/** Consensus score as a whole percentage, e.g. 0.624 -> 62 */
export function formatConsensusPercent(consensus: number): number {
  return Math.round(consensus * 100);
}
