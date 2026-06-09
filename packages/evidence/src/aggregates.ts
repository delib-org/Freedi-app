/**
 * Question-aggregate recompute (§1.4 / §4.4). Pure given the already-scored
 * option children. The server's `recomputeAncestors` pass calls this after
 * re-scoring an option's C, then denormalizes the result onto the question.
 */
import type { ConvergenceMetric } from './types';
import { convergenceV1 } from './convergence';

export interface OptionChildSummary {
  statementId: string;
  /** Corroboration score C of this option child, [0,1]. */
  corroborationScore: number;
}

export interface QuestionAggregates {
  optionCount: number;
  leadingOptionId: string | null;
  convergenceIndex: number;
}

export function computeQuestionAggregates(
  optionChildren: OptionChildSummary[],
  metric: ConvergenceMetric = convergenceV1,
): QuestionAggregates {
  const optionCount = optionChildren.length;
  if (optionCount === 0) {
    return { optionCount: 0, leadingOptionId: null, convergenceIndex: 0 };
  }

  let leader = optionChildren[0];
  for (const o of optionChildren) {
    if (o.corroborationScore > leader.corroborationScore) leader = o;
  }

  const convergenceIndex = metric.compute(
    optionChildren.map((o) => o.corroborationScore),
  );

  return {
    optionCount,
    leadingOptionId: leader.statementId,
    convergenceIndex,
  };
}
