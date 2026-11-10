import { useEffect, useMemo, useState } from 'react';
import { QuestionProgress, Statement, StatementType } from '@freedi/shared-types';
import { rebuildQuestionProgressOnce } from '@/controllers/db/questionProgress/rebuildQuestionProgress';
import { needsProgressRebuild } from '@/helpers/questionProgressHealth';
import { useQuestionProgressRead } from './useQuestionProgress';

export interface ParticipationStats {
	/** Unique users who entered the question */
	entered: number;
	/** Unique users who suggested options */
	suggested: number;
	/** Unique users who evaluated options */
	evaluated: number;
}

const ALWAYS_POLL = (): boolean => true;

/** Cluster and synthesis spawns are stored as options but are nobody's answer. */
function isDerivedOption(statement: Statement): boolean {
	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		statement.statementType === StatementType.synthesis
	);
}

/**
 * View tracking started mid-project, so `entered` alone can undercount: never
 * report fewer entrants than the people known to have taken part.
 */
function toHostStats(progress: QuestionProgress): ParticipationStats {
	const { entered, suggested, evaluated } = progress;

	return { entered: Math.max(entered, suggested, evaluated), suggested, evaluated };
}

/**
 * The participation funnel of a question, for its hosts: reads of
 * `questionProgress/{questionId}`, at most one a minute and paused in a hidden
 * tab. Everyone else makes no read at all, and participants get their own
 * rounded view from `GroupProgress`.
 *
 * Counters that are missing or clearly behind the question (older questions)
 * are rebuilt once per session. Null until the numbers can be trusted, so a
 * host never reads a zero that only means "not loaded" or "not counted".
 */
export function useParticipationStats(
	statement: Statement | undefined,
	isHost: boolean,
	options: Statement[],
): ParticipationStats | null {
	const isQuestion = statement?.statementType === StatementType.question;
	const hostStatementId = isHost && isQuestion ? statement?.statementId : undefined;
	const { progress, isLoaded, reload } = useQuestionProgressRead(
		hostStatementId,
		String(options.length),
		{ pollWhile: hostStatementId ? ALWAYS_POLL : undefined },
	);
	const [rebuild, setRebuild] = useState<{ statementId: string; succeeded: boolean } | null>(null);

	const answers = useMemo(() => options.filter((o) => !isDerivedOption(o)).length, [options]);
	const raters = Math.max(
		statement?.evaluation?.asParentTotalEvaluators ?? 0,
		statement?.totalEvaluators ?? 0,
	);
	const isBehind =
		!!hostStatementId && isLoaded && needsProgressRebuild(progress, { raters, answers });
	const rebuildDone = rebuild?.statementId === hostStatementId ? rebuild : null;

	useEffect(() => {
		if (!hostStatementId || !isBehind || rebuildDone) return;
		let cancelled = false;
		void rebuildQuestionProgressOnce(hostStatementId).then((succeeded) => {
			if (cancelled) return;
			setRebuild({ statementId: hostStatementId, succeeded });
			if (succeeded) reload();
		});

		return () => {
			cancelled = true;
		};
	}, [hostStatementId, isBehind, rebuildDone, reload]);

	if (!progress || (isBehind && !rebuildDone?.succeeded)) return null;

	return toHostStats(progress);
}
