import { FC, useMemo, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import { triggerSynthesizeSelected } from '@/controllers/db/synthesis/synthesisOperations';
import type { Statement } from '@freedi/shared-types';
import styles from './SelectiveOptionsList.module.scss';

const MAX_SELECTABLE = 200;

interface Props {
	questionId: string;
	disabled: boolean;
	/**
	 * Effective engagement thresholds for this question. Used to identify
	 * which options are above the engagement bar (eligible for the regular
	 * synthesize path) versus below it. Selective synthesis is mainly for
	 * surfacing the above-threshold set so admins can pick subsets to
	 * force through the pipeline now.
	 */
	minEvaluators: number;
	minConsensus: number;
	onResult: (result: { enqueued: number; skipped: number; mergedIntoExistingRun: boolean }) => void;
}

const SelectiveOptionsList: FC<Props> = ({
	questionId,
	disabled,
	minEvaluators,
	minConsensus,
	onResult,
}) => {
	const { t } = useTranslation();
	const options = useAppSelector(statementOptionsSelector(questionId));

	const [expanded, setExpanded] = useState(false);
	const [search, setSearch] = useState('');
	const [ungroupedOnly, setUngroupedOnly] = useState(false);
	// Default ON — the typical workflow is "pick from the eligible set."
	const [aboveThresholdOnly, setAboveThresholdOnly] = useState(true);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const lowered = search.trim().toLowerCase();

		return options.filter((opt: Statement) => {
			if (ungroupedOnly && (opt.integratedOptions ?? []).length > 0) return false;
			if (aboveThresholdOnly) {
				const evals = opt.evaluation?.numberOfEvaluators ?? 0;
				const cons = opt.consensus ?? 0;
				if (evals < minEvaluators) return false;
				if (cons < minConsensus) return false;
			}
			if (lowered && !opt.statement.toLowerCase().includes(lowered)) return false;

			return true;
		});
	}, [options, search, ungroupedOnly, aboveThresholdOnly, minEvaluators, minConsensus]);

	function toggle(id: string): void {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else if (next.size < MAX_SELECTABLE) next.add(id);

			return next;
		});
	}

	function handleSelectAllFiltered(): void {
		const next = new Set(selected);
		for (const opt of filtered) {
			if (next.size >= MAX_SELECTABLE) break;
			next.add(opt.statementId);
		}
		setSelected(next);
	}

	function handleClear(): void {
		setSelected(new Set());
	}

	async function handleSubmit(): Promise<void> {
		if (selected.size === 0) return;
		if (selected.size > MAX_SELECTABLE) {
			setSubmitError(`${t('Too many selected')} (max ${MAX_SELECTABLE})`);

			return;
		}
		setSubmitting(true);
		setSubmitError(null);
		try {
			const result = await triggerSynthesizeSelected(questionId, Array.from(selected));
			onResult(result);
			setSelected(new Set());
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : t('Submit failed'));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className={styles.selectiveList}>
			<button
				type="button"
				className={styles.summary}
				aria-expanded={expanded}
				aria-controls="selective-list-body"
				onClick={() => setExpanded((v) => !v)}
			>
				{t('Synthesize selected options')}
			</button>
			{expanded && (
				<div id="selective-list-body" className={styles.body}>
					<div className={styles.filterBar}>
						<input
							type="text"
							placeholder={t('Search options…')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label={t('Search options')}
						/>
						<label className={styles.filterCheckbox}>
							<input
								type="checkbox"
								checked={ungroupedOnly}
								onChange={(e) => setUngroupedOnly(e.target.checked)}
							/>
							{t('Ungrouped only')}
						</label>
						<label className={styles.filterCheckbox}>
							<input
								type="checkbox"
								checked={aboveThresholdOnly}
								onChange={(e) => setAboveThresholdOnly(e.target.checked)}
							/>
							{t('Above threshold only')}
						</label>
					</div>

					<div className={styles.list}>
						{filtered.length === 0 ? (
							<div className={styles.emptyState}>{t('No options match the current filter')}</div>
						) : (
							<ul>
								{filtered.slice(0, 500).map((opt: Statement) => {
									const evals = opt.evaluation?.numberOfEvaluators ?? 0;
									const cons = opt.consensus ?? 0;
									const inCluster = (opt.integratedOptions ?? []).length > 0;
									const checked = selected.has(opt.statementId);

									return (
										<li key={opt.statementId} className={styles.row}>
											<input
												type="checkbox"
												checked={checked}
												onChange={() => toggle(opt.statementId)}
												aria-label={`${t('Select')}: ${opt.statement}`}
											/>
											<span className={styles.optionText} title={opt.statement}>
												{opt.statement}
											</span>
											<span className={styles.metric}>
												{evals} · {cons.toFixed(2)}
											</span>
											{inCluster && <span className={styles.clusterBadge}>{t('in cluster')}</span>}
										</li>
									);
								})}
							</ul>
						)}
					</div>

					<div className={styles.footer}>
						<div>
							<button
								type="button"
								className={styles.selectAllButton}
								onClick={handleSelectAllFiltered}
								disabled={filtered.length === 0 || disabled}
							>
								{t('Select all matching filter')}
							</button>
							{selected.size > 0 && (
								<>
									{' · '}
									<button
										type="button"
										className={styles.selectAllButton}
										onClick={handleClear}
										disabled={disabled}
									>
										{t('Clear')}
									</button>
								</>
							)}
						</div>
						<button
							type="button"
							className={styles.submitButton}
							onClick={handleSubmit}
							disabled={selected.size === 0 || disabled || submitting}
						>
							{submitting
								? t('Submitting…')
								: `${t('Synthesize')} ${selected.size} ${t('selected')}`}
						</button>
					</div>
					{submitError && (
						<div role="alert" style={{ color: 'var(--danger, #d3493a)', fontSize: '0.85rem' }}>
							{submitError}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default SelectiveOptionsList;
