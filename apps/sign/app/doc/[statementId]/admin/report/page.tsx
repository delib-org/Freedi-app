'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import type {
	DocumentReport,
	DocumentReportNarrative,
	DocumentReportRecord,
	ParagraphRef,
} from '@freedi/shared-types';
import styles from './report.module.scss';

/**
 * Minimal, safe markdown renderer for AI narrative bodies.
 * Supports headings (#..###), bullet lists (- / *), bold (**text**) and paragraphs.
 */
function renderInline(text: string): React.ReactNode {
	const parts = text.split(/\*\*(.+?)\*\*/g);

	return parts.map((part, index) =>
		index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>
	);
}

function MarkdownBody({ body }: { body: string }) {
	const blocks = body.split(/\n{2,}/);

	return (
		<div className={styles.markdown}>
			{blocks.map((block, blockIndex) => {
				const lines = block.split('\n').filter((line) => line.trim() !== '');
				if (lines.length === 0) return null;

				const isList = lines.every((line) => /^\s*[-*•]\s+/.test(line) || /^\s*\d+\.\s+/.test(line));
				if (isList) {
					return (
						<ul key={blockIndex}>
							{lines.map((line, lineIndex) => (
								<li key={lineIndex}>
									{renderInline(line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, ''))}
								</li>
							))}
						</ul>
					);
				}

				const headingMatch = lines[0].match(/^(#{1,4})\s+(.*)$/);
				if (headingMatch && lines.length === 1) {
					return <h4 key={blockIndex}>{renderInline(headingMatch[2])}</h4>;
				}

				return <p key={blockIndex}>{renderInline(lines.join(' '))}</p>;
			})}
		</div>
	);
}

function MetricTile({ value, label }: { value: string | number; label: string }) {
	return (
		<div className={styles.metricTile}>
			<span className={styles.metricValue}>{value}</span>
			<span className={styles.metricLabel}>{label}</span>
		</div>
	);
}

function ParagraphRefList({ title, refs, tone }: { title: string; refs: ParagraphRef[]; tone: 'positive' | 'negative' }) {
	const { t } = useTranslation();

	if (refs.length === 0) return null;

	return (
		<section className={styles.refSection}>
			<h3>{title}</h3>
			<ul className={styles.refList}>
				{refs.map((ref) => (
					<li key={ref.paragraphId} className={`${styles.refCard} ${styles[tone]}`}>
						<span className={styles.refOrder}>§{ref.order + 1}</span>
						<div className={styles.refBody}>
							<p className={styles.refText}>{ref.textPreview}</p>
							<p className={styles.refReason}>{ref.reason}</p>
						</div>
						<span className={styles.refScore} title={t('approvalRate')}>
							{Math.round(ref.score * 100)}%
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

export default function DocumentReportPage() {
	const params = useParams();
	const statementId = params?.statementId as string;
	const { t } = useTranslation();

	const [record, setRecord] = useState<DocumentReportRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchReport = useCallback(
		async (fresh: boolean) => {
			try {
				setError(null);
				if (fresh) setRefreshing(true);
				const response = await fetch(
					`/api/admin/report/${statementId}${fresh ? '?fresh=1' : ''}`
				);
				if (!response.ok) {
					throw new Error(t('Failed to load report'));
				}
				const result = (await response.json()) as DocumentReportRecord;
				setRecord(result);
			} catch (err) {
				setError(err instanceof Error ? err.message : t('Failed to load report'));
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[statementId, t]
	);

	useEffect(() => {
		if (statementId) {
			fetchReport(false);
		}
	}, [statementId, fetchReport]);

	const handleGenerateNarrative = useCallback(async () => {
		try {
			setError(null);
			setGenerating(true);
			const response = await fetch(`/api/admin/report/${statementId}/narrative`, {
				method: 'POST',
			});
			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(data?.error || t('AI report generation failed'));
			}
			// Refetch the record so JSON stats and narrative stay in sync
			await fetchReport(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('AI report generation failed'));
		} finally {
			setGenerating(false);
		}
	}, [statementId, fetchReport, t]);

	if (loading) {
		return (
			<div className={styles.container}>
				<div className={styles.loading}>
					<div className={styles.spinner} />
					<p>{t('loading')}</p>
				</div>
			</div>
		);
	}

	const report: DocumentReport | undefined = record?.json;
	const narrative: DocumentReportNarrative | null = record?.narrative ?? null;

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div>
					<h1 className={styles.title}>{t('Document Report')}</h1>
					<p className={styles.subtitle}>{t('How your community read, discussed, and decided on this document')}</p>
					{record && (
						<p className={styles.timestamp}>
							{t('Last updated')}: {new Date(record.generatedAt).toLocaleString()}
						</p>
					)}
				</div>
				<div className={styles.actions}>
					<button
						type="button"
						className={styles.secondaryBtn}
						onClick={() => fetchReport(true)}
						disabled={refreshing || generating}
					>
						{refreshing ? t('loading') : t('Refresh data')}
					</button>
					<a
						className={styles.secondaryBtn}
						href={`/api/admin/report/${statementId}?download=1`}
						download
					>
						{t('Download JSON')}
					</a>
					<button
						type="button"
						className={styles.primaryBtn}
						onClick={handleGenerateNarrative}
						disabled={generating || refreshing}
					>
						{generating
							? t('Generating AI report')
							: narrative
								? t('Regenerate AI report')
								: t('Generate AI report')}
					</button>
				</div>
			</header>

			{error && <div className={styles.error}>{error}</div>}

			{generating && (
				<div className={styles.generatingNotice}>
					<div className={styles.spinner} />
					<p>{t('The AI is analyzing your document data. This can take a minute.')}</p>
				</div>
			)}

			{report && (
				<>
					<div className={styles.metricsGrid}>
						<MetricTile value={report.funnel.uniqueVisitors} label={t('Unique visitors')} />
						<MetricTile value={report.funnel.commenters} label={t('Commenters')} />
						<MetricTile value={report.funnel.approvers} label={t('Approvers')} />
						<MetricTile value={report.documentSignatures.signed} label={t('Signed')} />
						<MetricTile value={report.documentSignatures.rejected} label={t('Rejected')} />
						{report.documentSignatures.averageSatisfaction !== null && (
							<MetricTile
								value={report.documentSignatures.averageSatisfaction}
								label={t('Average satisfaction')}
							/>
						)}
					</div>

					<ParagraphRefList
						title={t('What the community supports')}
						refs={report.insights.topConsensus}
						tone="positive"
					/>
					<ParagraphRefList
						title={t('Friction points')}
						refs={report.insights.topFriction}
						tone="negative"
					/>

					{report.insights.dropOff.length > 0 && (
						<section className={styles.refSection}>
							<h3>{t('Reader drop-off')}</h3>
							<ul className={styles.dropOffList}>
								{report.insights.dropOff.map((point) => (
									<li key={point.paragraphId}>
										§{point.order + 1}: {Math.round(point.retentionBefore * 100)}% →{' '}
										{Math.round(point.retentionAfter * 100)}%
									</li>
								))}
							</ul>
						</section>
					)}

					{report.documentSignatures.rejectionReasons.length > 0 && (
						<section className={styles.refSection}>
							<h3>{t('Rejection reasons')}</h3>
							<ul className={styles.reasonsList}>
								{report.documentSignatures.rejectionReasons.map((reason, index) => (
									<li key={index}>{reason}</li>
								))}
							</ul>
						</section>
					)}
				</>
			)}

			<section className={styles.narrativeSection}>
				<h2>{t('AI analysis')}</h2>
				{narrative ? (
					<>
						<p className={styles.timestamp}>
							{t('Generated')}: {new Date(narrative.generatedAt).toLocaleString()}
						</p>
						{narrative.sections.map((section) => (
							<article key={section.id} className={styles.narrativeArticle}>
								<h3>{section.title}</h3>
								<MarkdownBody body={section.body} />
							</article>
						))}
					</>
				) : (
					<p className={styles.emptyNarrative}>
						{t('No AI report yet. Generate one to get insights and recommendations.')}
					</p>
				)}
			</section>
		</div>
	);
}
