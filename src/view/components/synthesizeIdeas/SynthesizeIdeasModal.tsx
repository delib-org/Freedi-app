import { FC, useCallback, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import {
	synthesizeIdeasPreview,
	synthesizeIdeasExecute,
	SynthesisFilters,
	SynthesisPreviewGroup,
	SynthesisPreviewResponse,
} from '@/controllers/db/synthesis/synthesisController';
import styles from './SynthesizeIdeasModal.module.scss';

interface SynthesizeIdeasModalProps {
	parentStatementId: string;
	onClose: () => void;
	onSuccess?: (createdCount: number) => void;
}

type Step = 'config' | 'loading-preview' | 'preview' | 'executing' | 'success' | 'error';

interface EditableGroup extends SynthesisPreviewGroup {
	accepted: boolean;
	titleDraft: string;
	descriptionDraft: string;
	paragraphsDraft: string[];
}

const DEFAULT_THRESHOLD = 0.9;

const SynthesizeIdeasModal: FC<SynthesizeIdeasModalProps> = ({
	parentStatementId,
	onClose,
	onSuccess,
}) => {
	const { t } = useTranslation();

	const [step, setStep] = useState<Step>('config');
	const [error, setError] = useState<string | null>(null);

	// Config inputs
	const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
	const [minAverage, setMinAverage] = useState<string>('');
	const [minConsensus, setMinConsensus] = useState<string>('');
	const [minEvaluators, setMinEvaluators] = useState<string>('2');

	// Preview state
	const [previewMeta, setPreviewMeta] = useState<SynthesisPreviewResponse | null>(null);
	const [groups, setGroups] = useState<EditableGroup[]>([]);

	// Result state
	const [createdCount, setCreatedCount] = useState<number>(0);

	const buildFilters = useCallback((): SynthesisFilters => {
		const filters: SynthesisFilters = {};
		const avg = parseFloat(minAverage);
		if (!Number.isNaN(avg)) filters.minAverage = avg;
		const cons = parseFloat(minConsensus);
		if (!Number.isNaN(cons)) filters.minConsensus = cons;
		const evals = parseInt(minEvaluators, 10);
		if (!Number.isNaN(evals)) filters.minEvaluators = evals;

		return filters;
	}, [minAverage, minConsensus, minEvaluators]);

	const runPreview = useCallback(async () => {
		setStep('loading-preview');
		setError(null);
		try {
			const result = await synthesizeIdeasPreview({
				parentStatementId,
				threshold,
				filters: buildFilters(),
			});
			setPreviewMeta(result);
			setGroups(
				result.groups.map((g) => ({
					...g,
					// Pre-uncheck groups the AI refused to synthesize (directional
					// split). Admin can override by checking, but the default is
					// "skip — needs manual splitting first".
					accepted: g.cannotSynthesize !== true,
					titleDraft: g.suggestedTitle,
					descriptionDraft: g.suggestedDescription,
					paragraphsDraft: Array.isArray(g.suggestedParagraphs) ? g.suggestedParagraphs : [],
				})),
			);
			if (result.status === 'needs-embeddings') {
				setError(
					t('Embeddings coverage is too low ({coverage}%) — backfill embeddings first.').replace(
						'{coverage}',
						String(result.embeddingCoverage),
					),
				);
				setStep('error');
			} else if (result.status === 'no-candidates') {
				setError(t('No near-duplicate candidates found at this threshold.'));
				setStep('error');
			} else {
				setStep('preview');
			}
		} catch (err) {
			logError(err, {
				operation: 'SynthesizeIdeasModal.runPreview',
				statementId: parentStatementId,
			});
			setError(t('Failed to run synthesis preview'));
			setStep('error');
		}
	}, [buildFilters, parentStatementId, t, threshold]);

	const updateGroup = useCallback((groupId: string, patch: Partial<EditableGroup>) => {
		setGroups((prev) => prev.map((g) => (g.groupId === groupId ? { ...g, ...patch } : g)));
	}, []);

	const handleConfirm = useCallback(async () => {
		const accepted = groups.filter((g) => g.accepted && g.titleDraft.trim().length > 0);
		if (accepted.length === 0) {
			setError(t('Select at least one group to synthesize.'));

			return;
		}

		setStep('executing');
		setError(null);
		try {
			const result = await synthesizeIdeasExecute({
				parentStatementId,
				threshold,
				filters: buildFilters(),
				confirmedGroups: accepted.map((g) => ({
					memberIds: g.memberIds,
					mergedTitle: g.titleDraft.trim(),
					mergedDescription: g.descriptionDraft.trim(),
					paragraphs: g.paragraphsDraft.length > 0 ? g.paragraphsDraft : undefined,
				})),
			});
			setCreatedCount(result.createdCount);
			setStep('success');
			onSuccess?.(result.createdCount);
		} catch (err) {
			logError(err, {
				operation: 'SynthesizeIdeasModal.handleConfirm',
				statementId: parentStatementId,
			});
			setError(t('Failed to commit synthesis groups'));
			setStep('error');
		}
	}, [buildFilters, groups, onSuccess, parentStatementId, t, threshold]);

	const renderConfigStep = () => (
		<>
			<p className={styles.subtitle} dir="auto">
				{t(
					'Detect proposals that say the same thing in different words and merge them into one. Embeddings narrow the candidates; an AI judge confirms each pair before merging.',
				)}
			</p>
			<div className={styles.field}>
				<label htmlFor="threshold">
					{t('Similarity threshold')} ({threshold.toFixed(2)})
				</label>
				<input
					id="threshold"
					type="range"
					min={0.85}
					max={0.95}
					step={0.01}
					value={threshold}
					onChange={(e) => setThreshold(parseFloat(e.target.value))}
				/>
				<small dir="auto">{t('Higher = stricter near-duplicate match (default 0.90)')}</small>
			</div>
			<div className={styles.fieldRow}>
				<div className={styles.field}>
					<label htmlFor="min-avg">{t('Min average')}</label>
					<input
						id="min-avg"
						type="number"
						step="0.01"
						placeholder={t('Optional')}
						value={minAverage}
						onChange={(e) => setMinAverage(e.target.value)}
					/>
				</div>
				<div className={styles.field}>
					<label htmlFor="min-cons">{t('Min consensus')}</label>
					<input
						id="min-cons"
						type="number"
						step="0.01"
						placeholder={t('Optional')}
						value={minConsensus}
						onChange={(e) => setMinConsensus(e.target.value)}
					/>
				</div>
				<div className={styles.field}>
					<label htmlFor="min-evals">{t('Min evaluators')}</label>
					<input
						id="min-evals"
						type="number"
						step="1"
						value={minEvaluators}
						onChange={(e) => setMinEvaluators(e.target.value)}
					/>
				</div>
			</div>
			{/*
			 * Action footer: secondary first, primary second in source order.
			 * With justify-content: flex-end this puts primary at the trailing
			 * edge — right in LTR, left in RTL — which matches platform
			 * conventions (primary = forward action, on the leading-to-end
			 * direction of reading).
			 */}
			<div className={styles.actions}>
				<button type="button" className={`${styles.button} ${styles.secondary}`} onClick={onClose}>
					{t('Cancel')}
				</button>
				<button type="button" className={`${styles.button} ${styles.primary}`} onClick={runPreview}>
					{t('Preview groups')}
				</button>
			</div>
		</>
	);

	const renderPreviewStep = () => (
		<>
			{previewMeta && (
				<div className={styles.summary} role="group" aria-label={t('Pipeline summary')}>
					<div className={styles.metric}>
						<span className={styles.value}>{previewMeta.inputCount}</span>
						<span className={styles.label}>{t('Options considered')}</span>
					</div>
					<div className={styles.metric}>
						<span className={styles.value}>{previewMeta.candidateEdgeCount}</span>
						<span className={styles.label}>{t('Candidate edges')}</span>
					</div>
					<div className={styles.metric}>
						<span className={styles.value}>{previewMeta.verifiedSameEdgeCount}</span>
						<span className={styles.label}>{t('Confirmed by AI')}</span>
					</div>
					<div className={styles.metric}>
						<span className={styles.value}>{groups.length}</span>
						<span className={styles.label}>{t('Synthesis groups')}</span>
					</div>
				</div>
			)}

			{groups.length === 0 ? (
				<p className={styles.empty}>{t('No groups to commit at this threshold.')}</p>
			) : (
				<div className={styles.groupList}>
					{groups.map((g) => (
						<div
							key={g.groupId}
							className={styles.group}
							data-accepted={String(g.accepted)}
							data-cannot-synthesize={String(g.cannotSynthesize === true)}
						>
							{g.cannotSynthesize && (
								<div
									className={styles.splitNotice}
									role="status"
									aria-label={t('AI declined to synthesize this group')}
								>
									<strong>{t('AI declined: directional conflict')}</strong>
									<span dir="auto">
										{g.splitReason ||
											t('The source ideas pull in incompatible solution directions.')}
									</span>
									{Array.isArray(g.splitProposal) && g.splitProposal.length > 1 && (
										<span className={styles.splitHint} dir="auto">
											{t('Suggested split: ')}
											{g.splitProposal
												.map(
													(grp, i) =>
														`${t('group')} ${String.fromCharCode(65 + i)} (${grp.length})`,
												)
												.join(' / ')}
										</span>
									)}
									<span className={styles.splitHint} dir="auto">
										{t(
											'To proceed, uncheck this group and re-run the pipeline after splitting it manually in the curation UI.',
										)}
									</span>
								</div>
							)}

							{/* Header row: checkbox + editable title/description */}
							<div className={styles.groupHeader}>
								<input
									type="checkbox"
									checked={g.accepted}
									onChange={(e) => updateGroup(g.groupId, { accepted: e.target.checked })}
									aria-label={t('Accept group')}
								/>
								<div className={styles.groupTitle}>
									<input
										type="text"
										value={g.titleDraft}
										onChange={(e) => updateGroup(g.groupId, { titleDraft: e.target.value })}
										placeholder={t('Merged title')}
										dir="auto"
									/>
									<textarea
										value={g.descriptionDraft}
										onChange={(e) => updateGroup(g.groupId, { descriptionDraft: e.target.value })}
										placeholder={t('Merged description (optional)')}
										dir="auto"
									/>
									<span className={styles.memberCount}>
										{t('{n} members').replace('{n}', String(g.memberIds.length))}
									</span>
								</div>
							</div>

							{/* Quiet labeled disclosure — chevron + label, NOT a primary blue bar */}
							{g.paragraphsDraft.length > 0 && (
								<details className={styles.paragraphPreview}>
									<summary>
										{t('Proposal sections ({n})').replace('{n}', String(g.paragraphsDraft.length))}
									</summary>
									<ol>
										{g.paragraphsDraft.map((p, i) => (
											<li key={i} dir="auto">
												{p}
											</li>
										))}
									</ol>
								</details>
							)}

							{/* Source ideas — labeled section with bullet rows that wrap properly */}
							<div className={styles.sourceSection}>
								<span className={styles.sourceLabel}>
									{t('Source ideas ({n})').replace('{n}', String(g.memberPreviews.length))}
								</span>
								<ul className={styles.memberList}>
									{g.memberPreviews.map((m) => (
										<li key={m.id} dir="auto">
											{m.statement}
										</li>
									))}
								</ul>
							</div>

							{/*
							 * AI explanation. dir="auto" lets the browser pick the right
							 * base direction per block, so an English AI explanation
							 * inside a Hebrew modal renders LTR without bleeding into
							 * the surrounding RTL layout.
							 */}
							{g.reasons.length > 0 && (
								<p className={styles.reasons} dir="auto">
									{t('AI: {reason}').replace('{reason}', g.reasons.join('; '))}
								</p>
							)}
						</div>
					))}
				</div>
			)}

			<div className={styles.actions}>
				<button
					type="button"
					className={`${styles.button} ${styles.secondary}`}
					onClick={() => setStep('config')}
				>
					{t('Back')}
				</button>
				<button
					type="button"
					className={`${styles.button} ${styles.primary}`}
					onClick={handleConfirm}
					disabled={groups.filter((g) => g.accepted).length === 0}
				>
					{t('Synthesize selected')}
				</button>
			</div>
		</>
	);

	const renderLoadingStep = (label: string) => (
		<div className={styles.notice}>
			<strong>{label}</strong>
			<span>{t('This can take a couple of minutes for large questions.')}</span>
		</div>
	);

	const renderErrorStep = () => (
		<>
			<div className={styles.error} dir="auto">
				{error}
			</div>
			<div className={styles.actions}>
				<button
					type="button"
					className={`${styles.button} ${styles.secondary}`}
					onClick={() => {
						setError(null);
						setStep('config');
					}}
				>
					{t('Back')}
				</button>
				<button type="button" className={`${styles.button} ${styles.primary}`} onClick={onClose}>
					{t('Close')}
				</button>
			</div>
		</>
	);

	const renderSuccessStep = () => (
		<>
			<div className={styles.notice}>
				<strong>{t('Synthesis complete')}</strong>
				<span>
					{t('{n} new synthesis statements created.').replace('{n}', String(createdCount))}
				</span>
			</div>
			<div className={styles.actions}>
				<button type="button" className={`${styles.button} ${styles.primary}`} onClick={onClose}>
					{t('Done')}
				</button>
			</div>
		</>
	);

	return (
		<Modal closeModal={onClose}>
			<div className={styles.synthesizeModal}>
				<div className={styles.header}>
					<h2>{t('Synthesize ideas')}</h2>
					<button
						type="button"
						className={styles.closeButton}
						onClick={onClose}
						aria-label={t('Close')}
					>
						×
					</button>
				</div>
				{step === 'config' && renderConfigStep()}
				{step === 'loading-preview' && renderLoadingStep(t('Searching for near-duplicates...'))}
				{step === 'preview' && renderPreviewStep()}
				{step === 'executing' && renderLoadingStep(t('Committing synthesis groups...'))}
				{step === 'error' && renderErrorStep()}
				{step === 'success' && renderSuccessStep()}
			</div>
		</Modal>
	);
};

export default SynthesizeIdeasModal;
