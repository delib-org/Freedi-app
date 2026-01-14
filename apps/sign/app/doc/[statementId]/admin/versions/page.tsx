'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
	DocumentVersion,
	VersionStatus,
	VersionChange,
	ChangeDecision,
} from '@freedi/shared-types';
import { API_ROUTES, VERSIONING } from '@/constants/common';
import { useAdminContext } from '../AdminContext';
import styles from '../admin.module.scss';

type GenerationStep = 'idle' | 'creating' | 'generating' | 'processing-ai' | 'complete' | 'error';

interface VersionWithChanges extends DocumentVersion {
	changes?: VersionChange[];
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
			console.error('Failed to fetch versions:', error);
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
			console.error('Failed to fetch version details:', error);
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
					}),
				}
			);

			if (!generateResponse.ok) {
				throw new Error('Failed to generate changes');
			}

			const generateData = await generateResponse.json();

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
					// AI processing failed, but version is still created
					console.error('AI processing failed, continuing without AI suggestions');
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
			}, 3000);
		} catch (error) {
			console.error('Version creation failed:', error);
			setGenerationStep('error');
			setGenerationMessage(t('Failed to create version. Please try again.'));

			setTimeout(() => {
				setGenerationStep('idle');
				setGenerationMessage('');
			}, 5000);
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
			console.error('Failed to publish version:', error);
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
			console.error('Failed to delete version:', error);
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
			console.error('Failed to update change decision:', error);
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
							{t('Create New Version')}
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
								.filter((c) => c.sources.length > 0)
								.map((change) => (
									<div key={change.changeId} className={styles.changeCard}>
										<div className={styles.changeHeader}>
											<span className={styles.impactScore}>
												{tWithParams('Impact: {{score}}', {
													score: change.combinedImpact.toFixed(2),
												})}
											</span>
											<span
												className={`${styles.decisionBadge} ${
													styles[`decision${change.adminDecision}`]
												}`}
											>
												{change.adminDecision}
											</span>
										</div>

										<div className={styles.contentComparison}>
											<div className={styles.originalContent}>
												<h4>{t('Original')}</h4>
												<p>{change.originalContent}</p>
											</div>
											<div className={styles.proposedContent}>
												<h4>{t('Proposed')}</h4>
												<p>{change.finalContent || change.proposedContent}</p>
											</div>
										</div>

										{change.aiReasoning && (
											<div className={styles.aiReasoning}>
												<h4>{t('AI Reasoning')}</h4>
												<p>{change.aiReasoning}</p>
											</div>
										)}

										<div className={styles.sourcesInfo}>
											<h4>{tWithParams('Based on {{count}} feedback items', { count: change.sources.length })}</h4>
											<ul>
												{change.sources.slice(0, 3).map((source) => (
													<li key={source.sourceId}>
														<span className={styles.sourceType}>
															{source.type === 'suggestion' ? t('Suggestion') : t('Comment')}
														</span>
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
