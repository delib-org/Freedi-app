'use client';

import { useState, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { functions } from '@/lib/firebase/client';
import { logError } from '@/lib/utils/errorHandling';
import type { Survey } from '@/types/survey';
import SynthesisStatusBadge from './SynthesisStatusBadge';
import styles from './Admin.module.scss';

interface PerQuestionStatus {
	questionId: string;
	statement: string;
	liveSynthEffective: boolean;
	liveSynthExplicit: boolean | undefined;
	totalOptions: number;
	clusteredOptions: number;
}

interface SynthesisStatusResponse {
	surveyId: string;
	surveyLiveSynthEnabled: boolean | undefined;
	surveyLiveSynthEffective: boolean;
	questions: PerQuestionStatus[];
	aggregate: {
		totalQuestions: number;
		liveCount: number;
		disabledCount: number;
		surveyOffCount: number;
		totalOptions: number;
		clusteredOptions: number;
	};
}

interface SynthesisStatusSummaryProps {
	survey: Survey;
}

interface SynthesizeNowResult {
	questionId: string;
	enqueued?: number;
	error?: string;
}

/**
 * Status tab section that surfaces synthesis activity for the whole survey:
 *   - Master state pill (Live | Survey-off) based on survey settings.
 *   - Aggregate counts across all questions.
 *   - Per-question rows with badge + cluster counts.
 *   - "Synthesize now" button that fires the existing `synthesizeNow` Cloud
 *     Function once per questionId.
 */
export default function SynthesisStatusSummary({ survey }: SynthesisStatusSummaryProps) {
	const { t } = useTranslation();
	const { refreshToken } = useAuth();
	const [status, setStatus] = useState<SynthesisStatusResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isSynthesizing, setIsSynthesizing] = useState(false);
	const [lastRunResult, setLastRunResult] = useState<SynthesizeNowResult[] | null>(null);

	const fetchStatus = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const token = await refreshToken();
			if (!token) {
				setError(t('authRequired') || 'Authentication required');
				return;
			}
			const response = await fetch(
				`/api/surveys/${survey.surveyId}/synthesis-status`,
				{ headers: { Authorization: `Bearer ${token}` } }
			);
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to fetch synthesis status');
			}
			const data = (await response.json()) as SynthesisStatusResponse;
			setStatus(data);
		} catch (err) {
			logError(err, {
				operation: 'SynthesisStatusSummary.fetchStatus',
				metadata: { surveyId: survey.surveyId },
			});
			setError(err instanceof Error ? err.message : 'Failed to load status');
		} finally {
			setLoading(false);
		}
	}, [survey.surveyId, refreshToken, t]);

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	const handleSynthesizeNow = useCallback(async () => {
		if (!status) return;
		const eligible = status.questions.filter((q) => q.liveSynthEffective);
		if (eligible.length === 0) return;

		setIsSynthesizing(true);
		setLastRunResult(null);

		const synthesizeNow = httpsCallable<
			{ questionId: string },
			{ enqueued: number; etaMinutes: number }
		>(functions, 'synthesizeNow');

		const results: SynthesizeNowResult[] = [];
		for (const q of eligible) {
			try {
				const res = await synthesizeNow({ questionId: q.questionId });
				results.push({ questionId: q.questionId, enqueued: res.data.enqueued });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				results.push({ questionId: q.questionId, error: message });
				logError(err, {
					operation: 'SynthesisStatusSummary.synthesizeNow',
					metadata: { surveyId: survey.surveyId, questionId: q.questionId },
				});
			}
		}

		setLastRunResult(results);
		setIsSynthesizing(false);
		// Refresh status so clustered counts and badges update.
		await fetchStatus();
	}, [status, survey.surveyId, fetchStatus]);

	if (loading && !status) {
		return (
			<div className={styles.synthesisStatusSection}>
				<h3>{t('synthesisStatus') || 'Synthesis Status'}</h3>
				<p>{t('loading') || 'Loading…'}</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.synthesisStatusSection}>
				<h3>{t('synthesisStatus') || 'Synthesis Status'}</h3>
				<div className={styles.error}>
					<p>{error}</p>
					<button type="button" onClick={fetchStatus} className={styles.cancelButton}>
						{t('retry') || 'Retry'}
					</button>
				</div>
			</div>
		);
	}

	if (!status) return null;

	const surveyOff = !status.surveyLiveSynthEffective;

	return (
		<div className={styles.synthesisStatusSection}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: '0.75rem',
				}}
			>
				<h3 style={{ margin: 0 }}>{t('synthesisStatus') || 'Synthesis Status'}</h3>
				<SynthesisStatusBadge
					state={surveyOff ? 'survey-off' : 'live'}
					clusteredCount={status.aggregate.clusteredOptions}
				/>
			</div>

			<p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
				{surveyOff
					? t('synthesisSurveyOffDescription') ||
						'Live synthesis is turned OFF for this survey. No question will auto-merge options. Turn it back on in Edit Survey → AI Synthesis.'
					: t('synthesisSurveyOnDescription') ||
						'Live synthesis runs automatically as participants vote. New options that cross the evaluation threshold are merged into clusters with similar existing options.'}
			</p>

			{/* Aggregate counts */}
			<div className={styles.statsGrid} style={{ marginBottom: '1rem' }}>
				<div className={styles.statCard}>
					<span className={styles.statNumber}>{status.aggregate.totalQuestions}</span>
					<span className={styles.statLabel}>{t('questions') || 'Questions'}</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statNumber}>
						{surveyOff ? 0 : status.aggregate.liveCount}
					</span>
					<span className={styles.statLabel}>{t('liveCount') || 'Auto-synthesis on'}</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statNumber}>{status.aggregate.totalOptions}</span>
					<span className={styles.statLabel}>{t('totalOptions') || 'Options'}</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statNumber}>{status.aggregate.clusteredOptions}</span>
					<span className={styles.statLabel}>{t('clusteredOptions') || 'Grouped by AI'}</span>
				</div>
			</div>

			{/* Synthesize now */}
			<div style={{ marginBottom: '1.5rem' }}>
				<button
					type="button"
					className={styles.markAsPilotButton}
					onClick={handleSynthesizeNow}
					disabled={surveyOff || isSynthesizing || status.aggregate.liveCount === 0}
					title={
						surveyOff
							? t('synthesisDisabledTooltip') ||
								'Enable synthesis at the survey level to use this'
							: undefined
					}
				>
					{isSynthesizing
						? t('synthesizing') || 'Synthesizing…'
						: t('synthesizeNow') || 'Synthesize now'}
				</button>
				<p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
					{t('synthesizeNowDescription') ||
						'Manually trigger synthesis across all enabled questions in this survey. Useful before reviewing results or after a batch of new responses.'}
				</p>

				{lastRunResult && (
					<div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
						{lastRunResult.map((r) => (
							<div key={r.questionId}>
								{r.error
									? `⚠️ ${r.questionId.slice(0, 10)}…: ${r.error}`
									: `✓ ${r.questionId.slice(0, 10)}…: ${r.enqueued} ${
											t('optionsEnqueued') || 'options enqueued'
										}`}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Per-question rows */}
			<h4 style={{ marginBottom: '0.5rem' }}>{t('perQuestionStatus') || 'Per question'}</h4>
			<div className={styles.questionStatusList}>
				{status.questions.map((q, i) => (
					<div
						key={q.questionId}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.75rem',
							padding: '0.5rem 0.75rem',
							background: 'var(--bg-muted)',
							borderRadius: '8px',
							marginBottom: '0.25rem',
						}}
					>
						<span style={{ fontWeight: 600, minWidth: '1.5rem' }}>Q{i + 1}</span>
						<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
							{q.statement || q.questionId}
						</span>
						<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
							{q.clusteredOptions}/{q.totalOptions} {t('clustered') || 'clustered'}
						</span>
						<SynthesisStatusBadge
							compact
							state={
								surveyOff
									? 'survey-off'
									: q.liveSynthEffective
										? 'live'
										: 'disabled'
							}
							clusteredCount={q.clusteredOptions}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
