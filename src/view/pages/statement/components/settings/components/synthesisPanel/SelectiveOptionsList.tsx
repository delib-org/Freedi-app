import { FC, useMemo, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import { triggerSynthesizeSelected } from '@/controllers/db/synthesis/synthesisOperations';
import type { Statement } from '@freedi/shared-types';
import Button from '@/view/components/atomic/atoms/Button/Button';
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

	// How many options exist in total / would match without the threshold gate?
	// We use this to power the "softly suggest unchecking the filter" CTA.
	const totalMatchingWithoutThreshold = useMemo(() => {
		const lowered = search.trim().toLowerCase();

		return options.filter((opt: Statement) => {
			if (ungroupedOnly && (opt.integratedOptions ?? []).length > 0) return false;
			if (lowered && !opt.statement.toLowerCase().includes(lowered)) return false;

			return true;
		}).length;
	}, [options, search, ungroupedOnly]);

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

	const visible = filtered.slice(0, 500);
	const selectedCount = selected.size;
	// Helpful empty-state context: are we empty because of the threshold filter?
	const blockedByThresholdFilter =
		filtered.length === 0 && aboveThresholdOnly && totalMatchingWithoutThreshold > 0;

	return (
		<div className={styles.selective}>
			<button
				type="button"
				className={styles.selective__summary}
				aria-expanded={expanded}
				aria-controls="selective-list-body"
				onClick={() => setExpanded((v) => !v)}
			>
				<span className={styles.selective__chevron} aria-hidden="true">
					{expanded ? '–' : '+'}
				</span>
				<span className={styles.selective__summaryText}>{t('Synthesize selected options')}</span>
				{selectedCount > 0 && <span className={styles.selective__pill}>{selectedCount}</span>}
			</button>

			{expanded && (
				<div id="selective-list-body" className={styles.selective__body}>
					{/* Filter bar — search on its own row, chips below to avoid wrapping mess */}
					<div className={styles.filters}>
						<input
							type="text"
							className={styles.filters__search}
							placeholder={t('Search options…')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label={t('Search options')}
						/>
						<div className={styles.filters__chips} role="group" aria-label={t('Filters')}>
							<button
								type="button"
								className={styles.chip}
								data-active={aboveThresholdOnly}
								onClick={() => setAboveThresholdOnly((v) => !v)}
								aria-pressed={aboveThresholdOnly}
							>
								{t('Above threshold only')}
							</button>
							<button
								type="button"
								className={styles.chip}
								data-active={ungroupedOnly}
								onClick={() => setUngroupedOnly((v) => !v)}
								aria-pressed={ungroupedOnly}
							>
								{t('Ungrouped only')}
							</button>
						</div>
					</div>

					{/* List */}
					<div className={styles.list}>
						{visible.length === 0 ? (
							<div className={styles.empty}>
								<p className={styles.empty__title}>{t('No options match the current filter')}</p>
								{blockedByThresholdFilter ? (
									<>
										<p className={styles.empty__hint}>
											{`${totalMatchingWithoutThreshold} ${t(
												'options exist but none have crossed the threshold yet.',
											)}`}
										</p>
										<button
											type="button"
											className={styles.empty__action}
											onClick={() => setAboveThresholdOnly(false)}
										>
											{t('Show all options instead')}
										</button>
									</>
								) : (
									<p className={styles.empty__hint}>
										{t('Try clearing the search or filters to see more options.')}
									</p>
								)}
							</div>
						) : (
							<ul className={styles.list__items} role="listbox" aria-multiselectable="true">
								{visible.map((opt: Statement) => {
									const evals = opt.evaluation?.numberOfEvaluators ?? 0;
									const cons = opt.consensus ?? 0;
									const inCluster = (opt.integratedOptions ?? []).length > 0;
									const checked = selected.has(opt.statementId);

									return (
										<li key={opt.statementId} className={styles.row} data-checked={checked}>
											<label className={styles.row__label}>
												<input
													type="checkbox"
													className={styles.row__checkbox}
													checked={checked}
													onChange={() => toggle(opt.statementId)}
													aria-label={`${t('Select')}: ${opt.statement}`}
												/>
												<span className={styles.row__text} title={opt.statement}>
													{opt.statement}
												</span>
												<span className={styles.row__metrics}>
													<span className={styles.row__metric} title={t('Number of evaluators')}>
														{evals}
													</span>
													<span className={styles.row__metric} title={t('Consensus score')}>
														{cons.toFixed(2)}
													</span>
												</span>
												{inCluster && <span className={styles.row__badge}>{t('in cluster')}</span>}
											</label>
										</li>
									);
								})}
							</ul>
						)}
					</div>

					{/* Sticky footer */}
					<footer className={styles.footer}>
						<div className={styles.footer__left}>
							<button
								type="button"
								className={styles.linkButton}
								onClick={handleSelectAllFiltered}
								disabled={filtered.length === 0 || disabled}
							>
								{t('Select all matching filter')}
							</button>
							{selectedCount > 0 && (
								<>
									<span className={styles.footer__divider} aria-hidden="true">
										·
									</span>
									<button
										type="button"
										className={styles.linkButton}
										onClick={handleClear}
										disabled={disabled}
									>
										{t('Clear')}
									</button>
								</>
							)}
						</div>

						<div className={styles.footer__right}>
							<span className={styles.footer__count}>
								{`${selectedCount} ${t('selected')} / ${MAX_SELECTABLE} ${t('max')}`}
							</span>
							<Button
								text={submitting ? t('Submitting…') : `${t('Synthesize')} ${selectedCount}`}
								variant="primary"
								onClick={handleSubmit}
								disabled={selectedCount === 0 || disabled || submitting}
								loading={submitting}
							/>
						</div>
					</footer>

					{submitError && (
						<div className={styles.errorBanner} role="alert">
							{submitError}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default SelectiveOptionsList;
