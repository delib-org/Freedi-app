/**
 * Feature flags for the synthesis pipeline. Default OFF — the legacy code
 * path runs unchanged unless the operator explicitly enables a new module.
 *
 * Why env vars and not Firebase Remote Config: the codebase already uses
 * `process.env.X` for runtime tuning (see ANN_CONCURRENCY in
 * services/similarity-grouping-service.ts). Adding Remote Config would
 * introduce a new dependency for one new flag set; env vars give us the
 * same kill-switch behavior with a `firebase deploy --only functions`
 * after editing the function's runtime config.
 *
 * To turn a flag on for a single test:
 *   `SYNTHESIS_BULK_CLUSTER=true npx tsx scripts/seedFromWizcolDump.ts ...`
 *
 * To turn it on in production:
 *   set the env var in firebase.json `functions.runtime.environmentVariables`
 *   (or via `firebase functions:config:set`) and redeploy.
 *
 * Emergency disable: `EMERGENCY_DISABLE_SYNTHESIS_FLAGS=true` forces every
 * flag below to OFF regardless of its individual setting. The plan calls
 * this the "panic switch" — flip it without redeploying via the Firebase
 * Console function-config UI.
 */

function readBool(envValue: string | undefined): boolean {
	if (!envValue) return false;
	const v = envValue.trim().toLowerCase();

	return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

const emergencyDisable = (): boolean => readBool(process.env.EMERGENCY_DISABLE_SYNTHESIS_FLAGS);

export const synthesisFlags = {
	/**
	 * Ship 1.3: Bayesian-shrunk pre-filter. When ON, options are filtered to
	 * `score >= prior + 0.5σ` before Phase 3. When OFF, the existing hard-
	 * floor `minAverage / minConsensus / minEvaluators` knobs alone gate the
	 * working set.
	 */
	get bayesianPrefilter(): boolean {
		if (emergencyDisable()) return false;

		return readBool(process.env.SYNTHESIS_BAYESIAN_PREFILTER);
	},

	/**
	 * Ship 1.4: Bulk in-memory UMAP+DBSCAN replaces the N-anchor `findNearest`
	 * Phase 3. When ON, candidate clusters are produced in one in-process
	 * pass. When OFF, today's `buildCandidateEdges` runs.
	 */
	get bulkCluster(): boolean {
		if (emergencyDisable()) return false;

		return readBool(process.env.SYNTHESIS_BULK_CLUSTER);
	},

	/**
	 * Ship 1.5: Two-tier (cosine bands + medoid LLM) judge replaces Phase 4
	 * all-pairs LLM verification. Requires `bulkCluster` to also be ON; the
	 * legacy edge-based pipeline doesn't produce cluster candidates the
	 * two-tier judge can consume.
	 */
	get twoTierJudge(): boolean {
		if (emergencyDisable()) return false;

		return readBool(process.env.SYNTHESIS_TWO_TIER_JUDGE);
	},

	/**
	 * Ship 2: Async-job mode for synthesis. When ON:
	 *   - `synthesisJobStart` callable accepts requests, creates a
	 *     `synthesisJobs/{jobId}` doc, and returns the id in <1 s.
	 *   - The Firestore dispatcher (`fn_synthesisJobDispatch`) routes the
	 *     job through phases (loading → clustering → verifying → proposing).
	 *   - Each phase function is a separate Cloud Function, ≤300 s timeout,
	 *     so even very large bootstrap runs stay inside Functions limits.
	 *
	 * When OFF, the new callables reject with `failed-precondition`. The
	 * existing synchronous `synthesizeIdeasPreview` callable is unaffected
	 * either way — clients pick which entry point to use.
	 */
	get asyncJobMode(): boolean {
		if (emergencyDisable()) return false;

		return readBool(process.env.SYNTHESIS_ASYNC_JOB_MODE);
	},

	/**
	 * Ship 3b: Live-synth triggers (`fn_onOptionCreateLive`,
	 * `fn_onOptionUpdateLive`). When ON:
	 *   - Newly-created options carrying `metadata.optedOutOfMerge === true`
	 *     are checked against existing options/clusters via vector search.
	 *     Top hit ≥ 0.92 → attach (or spawn a new cluster from two similar
	 *     standalone options). [0.85, 0.92) → log to `_liveSynthCandidates/`
	 *     for admin review (no autonomous LLM call).
	 *   - Edited option text triggers a cosine-drift check vs old embedding;
	 *     if drift ≥ 0.05 the LLM judges whether the meaning still matches
	 *     the cluster. If diverged → unlink; clusters whose member count
	 *     drops to 1 are auto-dissolved.
	 *
	 * **Panic switch**: when OFF, the trigger handlers exit immediately at
	 * the top of the function. Bootstrap synthesis (Ships 1+2) and the
	 * cluster-aware polarization extension (Ship 3a) still run normally.
	 */
	get liveSynth(): boolean {
		if (emergencyDisable()) return false;

		return readBool(process.env.SYNTHESIS_LIVE_SYNTH_ENABLED);
	},

	/**
	 * Ship 3a: Cluster-aware polarization. When ON:
	 *   - The evaluation triggers walk to containing clusters
	 *     (`integratedOptions array-contains <statementId>`).
	 *   - For each containing cluster, enqueue a debounced recompute that
	 *     refreshes both the cluster's `evaluation.{...}` aggregate AND its
	 *     `polarizationIndex/{clusterId}` doc. The recompute uses the
	 *     direct-vote-wins rollup (Ship 1.2) so each evaluator counts once
	 *     on the cluster.
	 *   - The scheduled `fn_clusterRecomputeFlush` (every 1 min) runs the
	 *     queued recomputes and clears the queue.
	 *
	 * When OFF, the evaluation triggers behave exactly as today —
	 * polarization is computed only for the directly-evaluated statement.
	 * The flusher still runs but drains the queue without acting, so a
	 * flag flip stops new work immediately.
	 */
	get clusterAwarePolarization(): boolean {
		if (emergencyDisable()) return false;

		return readBool(process.env.SYNTHESIS_CLUSTER_AWARE_POLARIZATION);
	},
};

/**
 * The new clustering path is only taken when BOTH bulkCluster and
 * twoTierJudge are on. Either alone would mean piping cluster candidates
 * into all-pairs LLM (defeats the purpose) or piping all-pairs edges into
 * the cluster-shaped two-tier judge (impossible). Centralizing the gate
 * here prevents partial-config bugs.
 */
export function shouldUseBulkSynthesisPath(): boolean {
	return synthesisFlags.bulkCluster && synthesisFlags.twoTierJudge;
}
