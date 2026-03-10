'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
	DocumentVersion,
	VersionStatus,
	VersionChange,
	ChangeDecision,
	ChangeType,
	DocumentFeedbackSummary,
	RevisionStrategy,
} from '@freedi/shared-types';
import { API_ROUTES, VERSIONING, UI } from '@/constants/common';
import { useAdminContext } from '../AdminContext';
import styles from '../admin.module.scss';

/**
 * Log errors with context for debugging
 */
function logVersionError(operation: string, error: unknown, context?: Record<string, unknown>): void {
	const errorMessage = error instanceof Error ? error.message : String(error);
	console.error(`[Versions] ${operation}: ${errorMessage}`, {
		operation,
		error: errorMessage,
		...context,
		timestamp: new Date().toISOString(),
	});
}

type GenerationStep = 'idle' | 'creating' | 'generating' | 'processing-ai' | 'complete' | 'error';

interface VersionWithChanges extends DocumentVersion {
	changes?: VersionChange[];
}

interface GenerateResponseData {
	changesNeedingAI: number;
	revisionStrategy?: RevisionStrategy;
	rejectionRate?: number;
	overallApprovalRate?: number;
	documentFeedbackSummary?: DocumentFeedbackSummary;
}

export default function AdminVersionsPage() {
	const params = useParams();
	const router = useRouter();
	const statementId = params.statementId as string;
	const { t, tWithParams } = useTranslation();
	const { canManageSettings } = useAdminContext();

	const [versions, setVersions] = useState<DocumentVersion[]>([]);
	const [selectedVersion, setSelectedVersion] = useState<VersionWithChanges | null>(null);
	const [loading, setLoading] = useState(true);
	const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
	const [generationMessage, setGenerationMessage] = useState('');
	const [showRejectionReasons, setShowRejectionReasons] = useState(false);

	// Settings for generation
	const [settings, setSettings] = useState<{
		k1: number;
		k2: number;
		minImpactThreshold: number;
	}>({
		k1: VERSIONING.DEFAULT_K1,
		k2: VERSIONING.DEFAULT_K2,
		minImpactThreshold: VERSIONING.DEFAULT_MIN_IMPACT_THRESHOLD,
	});

	const fetchVersions = useCallback(async () => {
		try {
			setLoading(true);
			const response = await fetch(API_ROUTES.ADMIN_VERSIONS(statementId));

			if (response.ok) {
				const data = await response.json();
				setVersions(data.versions || []);
			}
		} catch (error) {
			logVersionError('fetchVersions', error, { statementId });
		} finally {
			setLoading(false);
		}
	}, [statementId]);

	const fetchVersionDetails = useCallback(async (versionId: string) => {
		try {
			const response = await fetch(API_ROUTES.ADMIN_VERSION(statementId, versionId));

			if (response.ok) {
				const data = await response.json();
				setSelectedVersion({
					...data.version,
					changes: data.changes,
				});
			}
		} catch (error) {
			logVersionError('fetchVersionDetails', error, { statementId, versionId });
		}
	}, [statementId]);

	useEffect(() => {
		fetchVersions();
	}, [fetchVersions]);

	useEffect(() => {
		if (!canManageSettings) {
			router.replace(`/doc/${statementId}/admin`);
		}
	}, [canManageSettings, router, statementId]);

	if (!canManageSettings) {
		return null;
	}

	const handleCreateVersion = async () => {
		try {
			setGenerationStep('creating');
			setGenerationMessage(t('Creating new version...'));

			// Step 1: Create version
			const createResponse = await fetch(API_ROUTES.ADMIN_VERSIONS(statementId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!createResponse.ok) {
				throw new Error('Failed to create version');
			}

			const { version } = await createResponse.json();

			setGenerationStep('generating');
			setGenerationMessage(t('Analyzing feedback and calculating impact...'));

			// Step 2: Generate changes
			const generateResponse = await fetch(
				API_ROUTES.ADMIN_VERSION_GENERATE(statementId, version.versionId),
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						k1: settings.k1,
						k2: settings.k2,
						minImpactThreshold: settings.minImpactThreshold,
						includeComments: true,
						includeSuggestions: true,
						includeApprovals: true,
						includeSignatures: true,
					}),
				}
			);

			if (!generateResponse.ok) {
				throw new Error('Failed to generate changes');
			}

			const generateData: GenerateResponseData = await generateResponse.json();

			if (generateData.changesNeedingAI > 0) {
				setGenerationStep('processing-ai');
				setGenerationMessage(
					tWithParams('Processing {{count}} changes with AI...', { count: generateData.changesNeedingAI })
				);

				// Step 3: Process with AI
				const aiResponse = await fetch(
					API_ROUTES.ADMIN_VERSION_PROCESS_AI(statementId, version.versionId),
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
					}
				);

				if (!aiResponse.ok) {
					logVersionError('processAI', new Error('AI processing failed'), { versionId: version.versionId });
				}
			}

			setGenerationStep('complete');
			setGenerationMessage(t('Version created successfully!'));

			// Refresh and select new version
			await fetchVersions();
			await fetchVersionDetails(version.versionId);

			setTimeout(() => {
				setGenerationStep('idle');
				setGenerationMessage('');
			}, UI.TOAST_DURATION);
		} catch (error) {
			logVersionError('createVersion', error, { statementId, settings });
			setGenerationStep('error');
			setGenerationMessage(t('Failed to create version. Please try again.'));

			setTimeout(() => {
				setGenerationStep('idle');
				setGenerationMessage('');
			}, UI.TOAST_DURATION + 2000);
		}
	};

	const handlePublishVersion = async (versionId: string) => {
		if (!confirm(t('Are you sure you want to publish this version? This will update the public document.'))) {
			return;
		}

		try {
			const response = await fetch(
				API_ROUTES.ADMIN_VERSION_PUBLISH(statementId, versionId),
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ applyToDocument: true }),
				}
			);

			if (response.ok) {
				await fetchVersions();

				if (selectedVersion?.versionId === versionId) {
					await fetchVersionDetails(versionId);
				}
			}
		} catch (error) {
			logVersionError('publishVersion', error, { statementId, versionId });
		}
	};

	const handleDeleteVersion = async (versionId: string) => {
		if (!confirm(t('Are you sure you want to delete this draft version?'))) {
			return;
		}

		try {
			const response = await fetch(
				API_ROUTES.ADMIN_VERSION(statementId, versionId),
				{ method: 'DELETE' }
			);

			if (response.ok) {
				await fetchVersions();

				if (selectedVersion?.versionId === versionId) {
					setSelectedVersion(null);
				}
			}
		} catch (error) {
			logVersionError('deleteVersion', error, { statementId, versionId });
		}
	};

	const handleChangeDecision = async (changeId: string, decision: ChangeDecision, finalContent?: string) => {
		try {
			const response = await fetch(API_ROUTES.ADMIN_CHANGE(changeId), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ adminDecision: decision, finalContent }),
			});

			if (response.ok && selectedVersion) {
				await fetchVersionDetails(selectedVersion.versionId);
			}
		} catch (error) {
			logVersionError('updateChangeDecision', error, { changeId, decision });
		}
	};

	const getStatusBadge = (status: VersionStatus) => {
		const badgeClass = {
			[VersionStatus.draft]: styles.badgeDraft,
			[VersionStatus.published]: styles.badgePublished,
			[VersionStatus.archived]: styles.badgeArchived,
		}[status];

		const label = {
			[VersionStatus.draft]: t('Draft'),
			[VersionStatus.published]: t('Published'),
			[VersionStatus.archived]: t('Archived'),
		}[status];

		return <span className={`${styles.badge} ${badgeClass}`}>{label}</span>;
	};

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const getChangeTypeLabel = (changeType: ChangeType): string => {
		switch (changeType) {
			case ChangeType.added:
				return t('New Paragraph');
			case ChangeType.removed:
				return t('Remove Paragraph');
			case ChangeType.modified:
				return t('Modified');
			default:
				return t('Unchanged');
		}
	};

	const feedbackSummary = selectedVersion?.documentFeedbackSummary as DocumentFeedbackSummary | undefined;

	if (loading) {
		return (
			<div className={styles.settingsPage}>
				<p style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-secondary)' }}>
					{t('Loading...')}
				</p>
			</div>
		);
	}

	return (
		<div className={styles.settingsPage}>
			<header className={styles.dashboardHeader}>
				<h1 className={styles.dashboardTitle}>{t('Document Versions')}</h1>
				<p className={styles.dashboardSubtitle}>
					{t('Create new versions based on public feedback using AI')}
				</p>
			</header>

			{/* Generation Settings */}
			<section className={styles.settingsSection}>
				<h2 className={styles.settingsSectionTitle}>{t('Generation Settings')}</h2>
				<p className={styles.settingDescription}>
					{t('Configure how public feedback is weighted when generating new versions')}
				</p>

				<div className={styles.settingRow}>
					<div className={styles.settingInfo}>
						<p className={styles.settingLabel}>{t('Suggestion Multiplier (k1)')}</p>
						<p className={styles.settingDescription}>
							{t('Higher values give more weight to suggestions and comments')}
						</p>
					</div>
					<input
						type="number"
						min="1"
						max="20"
						step="1"
						className={styles.numberInput}
						value={settings.k1}
						onChange={(e) => setSettings((prev) => ({ ...prev, k1: Number(e.target.value) }))}
					/>
				</div>

				<div className={styles.settingRow}>
					<div className={styles.settingInfo}>
						<p className={styles.settingLabel}>{t('Support Multiplier (k2)')}</p>
						<p className={styles.settingDescription}>
							{t('Higher values give more weight to community support/objection')}
						</p>
					</div>
					<input
						type="number"
						min="1"
						max="20"
						step="1"
						className={styles.numberInput}
						value={settings.k2}
						onChange={(e) => setSettings((prev) => ({ ...prev, k2: Number(e.target.value) }))}
					/>
				</div>

				<div className={styles.settingRow}>
					<div className={styles.settingInfo}>
						<p className={styles.settingLabel}>{t('Minimum Impact Threshold')}</p>
						<p className={styles.settingDescription}>
							{t('Feedback below this score will be ignored')}
						</p>
					</div>
					<input
						type="number"
						min="0"
						max="1"
						step="0.05"
						className={styles.numberInput}
						value={settings.minImpactThreshold}
						onChange={(e) =>
							setSettings((prev) => ({ ...prev, minImpactThreshold: Number(e.target.value) }))
						}
					/>
				</div>

				<button
					className={styles.saveButton}
					onClick={handleCreateVersion}
					disabled={generationStep !== 'idle'}
				>
					{generationStep === 'idle' ? (
						<>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M12 5v14M5 12h14" />
							</svg>
							{t('Get Recommendations for Change')}
						</>
					) : (
						<>
							<span className={styles.spinner} />
							{generationMessage}
						</>
					)}
				</button>
			</section>

			{/* Version List */}
			<section className={styles.settingsSection}>
				<h2 className={styles.settingsSectionTitle}>{t('Version History')}</h2>

				{versions.length === 0 ? (
					<p className={styles.emptyState}>{t('No versions yet. Create your first version above.')}</p>
				) : (
					<div className={styles.versionList}>
						{versions.map((version) => (
							<div
								key={version.versionId}
								className={`${styles.versionCard} ${
									selectedVersion?.versionId === version.versionId ? styles.selected : ''
								}`}
								onClick={() => fetchVersionDetails(version.versionId)}
							>
								<div className={styles.versionHeader}>
									<span className={styles.versionNumber}>
										{tWithParams('Version {{number}}', { number: version.versionNumber })}
									</span>
									{getStatusBadge(version.status)}
								</div>

								<div className={styles.versionMeta}>
									<span>{formatDate(version.createdAt)}</span>
									{version.aiGenerated && (
										<span className={styles.aiBadge}>{t('AI Generated')}</span>
									)}
								</div>

								{version.revisionStrategy === RevisionStrategy.fullRevision && (
									<span className={styles.strategyBadge}>
										{t('Full Revision')}
									</span>
								)}

								{version.summary && (
									<p className={styles.versionSummary}>{version.summary}</p>
								)}

								{version.changesCount !== undefined && version.changesCount > 0 && (
									<span className={styles.changesCount}>
										{tWithParams('{{count}} changes', { count: version.changesCount })}
									</span>
								)}

								<div className={styles.versionActions}>
									{version.status === VersionStatus.draft && (
										<>
											<button
												className={styles.actionButton}
												onClick={(e) => {
													e.stopPropagation();
													handlePublishVersion(version.versionId);
												}}
											>
												{t('Publish')}
											</button>
											<button
												className={`${styles.actionButton} ${styles.danger}`}
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteVersion(version.versionId);
												}}
											>
												{t('Delete')}
											</button>
										</>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Selected Version Details */}
			{selectedVersion && (
				<section className={styles.settingsSection}>
					<h2 className={styles.settingsSectionTitle}>
						{tWithParams('Version {{number}} Details', { number: selectedVersion.versionNumber })}
					</h2>

					{/* Strategy Banner */}
					{selectedVersion.revisionStrategy === RevisionStrategy.fullRevision && (
						<div className={styles.strategyBanner}>
							<strong>{t('Full Document Revision Recommended')}</strong>
							<p>{feedbackSummary?.strategyReasoning || t('Document rejection rate is high')}</p>
						</div>
					)}

					{/* Document Feedback Summary */}
					{feedbackSummary && (
						<div className={styles.versionDetailBox}>
							<h3>{t('Document Feedback Summary')}</h3>
							<div className={styles.feedbackStats}>
								<div className={styles.statItem}>
									<span className={styles.statLabel}>{t('Signed')}</span>
									<span className={styles.statValue}>{feedbackSummary.signedCount}</span>
								</div>
								<div className={styles.statItem}>
									<span className={styles.statLabel}>{t('Rejected')}</span>
									<span className={styles.statValue}>{feedbackSummary.rejectedCount}</span>
								</div>
								<div className={styles.statItem}>
									<span className={styles.statLabel}>{t('Rejection Rate')}</span>
									<span className={styles.statValue}>
										{(feedbackSummary.rejectionRate * 100).toFixed(0)}%
									</span>
								</div>
								<div className={styles.statItem}>
									<span className={styles.statLabel}>{t('Paragraph Approval Rate')}</span>
									<span className={styles.statValue}>
										{(feedbackSummary.overallApprovalRate * 100).toFixed(0)}%
									</span>
								</div>
								<div className={styles.statItem}>
									<span className={styles.statLabel}>{t('Revision Strategy')}</span>
									<span className={styles.statValue}>
										{feedbackSummary.revisionStrategy === RevisionStrategy.fullRevision
											? t('Full Revision')
											: t('Amend Paragraphs')}
									</span>
								</div>
							</div>

							{/* Rejection Reasons */}
							{feedbackSummary.rejectionReasons.length > 0 && (
								<div className={styles.rejectionReasonsSection}>
									<button
										className={styles.collapsibleToggle}
										onClick={() => setShowRejectionReasons(!showRejectionReasons)}
									>
										{tWithParams('{{count}} Rejection Reasons', {
											count: feedbackSummary.rejectionReasons.length,
										})}
										<span>{showRejectionReasons ? '\u25B2' : '\u25BC'}</span>
									</button>
									{showRejectionReasons && (
										<ul className={styles.rejectionReasonsList}>
											{feedbackSummary.rejectionReasons.map((r, i) => (
												<li key={i}>{r.reason}</li>
											))}
										</ul>
									)}
								</div>
							)}
						</div>
					)}

					{selectedVersion.summary && (
						<div className={styles.versionDetailBox}>
							<h3>{t('Summary')}</h3>
							<p>{selectedVersion.summary}</p>
						</div>
					)}

					{selectedVersion.changes && selectedVersion.changes.length > 0 && (
						<div className={styles.changesList}>
							<h3>{t('Proposed Changes')}</h3>

							{selectedVersion.changes
								.filter((c) => c.sources.length > 0 || c.changeType === ChangeType.added || c.changeType === ChangeType.removed)
								.map((change) => (
									<div
										key={change.changeId}
										className={`${styles.changeCard} ${
											change.changeType === ChangeType.added ? styles.changeAdded : ''
										} ${
											change.changeType === ChangeType.removed ? styles.changeRemoved : ''
										}`}
									>
										<div className={styles.changeHeader}>
											<span className={styles.impactScore}>
												{tWithParams('Impact: {{score}}', {
													score: change.combinedImpact.toFixed(2),
												})}
											</span>
											{change.changeType !== ChangeType.modified && (
												<span className={styles.changeTypeBadge}>
													{getChangeTypeLabel(change.changeType)}
												</span>
											)}
											{change.approvalRate !== undefined && (
												<span className={styles.approvalBadge}>
													{tWithParams('Approval: {{rate}}%', {
														rate: change.approvalRate.toFixed(0),
													})}
													{change.approvalVoters !== undefined && (
														<> ({change.approvalVoters})</>
													)}
												</span>
											)}
											<span
												className={`${styles.decisionBadge} ${
													styles[`decision${change.adminDecision}`]
												}`}
											>
												{change.adminDecision}
											</span>
										</div>

										<div className={styles.contentComparison}>
											{change.changeType !== ChangeType.added && (
												<div className={styles.originalContent}>
													<h4>{t('Original')}</h4>
													<p className={change.changeType === ChangeType.removed ? styles.strikethrough : ''}>
														{change.originalContent}
													</p>
												</div>
											)}
											{change.changeType !== ChangeType.removed && (
												<div className={styles.proposedContent}>
													<h4>
														{change.changeType === ChangeType.added
															? t('New Paragraph')
															: t('Proposed')}
													</h4>
													<p>{change.finalContent || change.proposedContent}</p>
												</div>
											)}
										</div>

										{change.aiReasoning && (
											<div className={styles.aiReasoning}>
												<h4>{t('AI Reasoning')}</h4>
												<p>{change.aiReasoning}</p>
											</div>
										)}

										{change.sources.length > 0 && (
											<div className={styles.sourcesInfo}>
												<h4>{tWithParams('Based on {{count}} feedback items', { count: change.sources.length })}</h4>
												<ul>
													{change.sources.slice(0, 3).map((source) => (
														<li key={source.sourceId}>
															<span className={styles.sourceType}>
																{source.type === 'suggestion'
																	? t('Suggestion')
																	: source.type === 'rejectionReason'
																		? t('Rejection Reason')
																		: t('Comment')}
															</span>
															{source.consensus !== undefined && (
																<span className={styles.sourceConsensus}>
																	{tWithParams('Consensus: {{score}}', {
																		score: source.consensus.toFixed(2),
																	})}
																</span>
															)}
															<span className={styles.sourceImpact}>
																{tWithParams('Impact: {{score}}', { score: source.impact.toFixed(2) })}
															</span>
															<q>{source.content.substring(0, 100)}...</q>
															<span className={styles.sourceAuthor}>
																- {source.creatorDisplayName}
															</span>
														</li>
													))}
												</ul>
											</div>
										)}

										{selectedVersion.status === VersionStatus.draft && (
											<div className={styles.decisionButtons}>
												<button
													className={`${styles.decisionButton} ${styles.approve}`}
													onClick={() =>
														handleChangeDecision(change.changeId, ChangeDecision.approved)
													}
													disabled={change.adminDecision === ChangeDecision.approved}
												>
													{t('Approve')}
												</button>
												<button
													className={`${styles.decisionButton} ${styles.reject}`}
													onClick={() =>
														handleChangeDecision(change.changeId, ChangeDecision.rejected)
													}
													disabled={change.adminDecision === ChangeDecision.rejected}
												>
													{t('Reject')}
												</button>
											</div>
										)}
									</div>
								))}
						</div>
					)}
				</section>
			)}
		</div>
	);
}
