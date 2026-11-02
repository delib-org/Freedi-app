'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { parseTargetPopulation } from '@/lib/utils/targetPopulation';
import { recalculateQuestions } from './recalculateQuestions';
import { useRatedQuestionIds } from './useRatedQuestionIds';
import styles from './StakeholderCountField.module.scss';

interface StakeholderCountFieldProps {
	/** The survey's number of stakeholders; undefined means not known. */
	value: number | undefined;
	onChange: (value: number | undefined) => void;
	/** Set when editing a saved survey: enables the stale note and recalculation. */
	surveyId?: string;
	questionIds: string[];
	/** True once the latest edit has reached the server (the cascade has run). */
	isSaved: boolean;
}

type RecalcStatus = 'idle' | 'running' | 'done' | 'failed';

/**
 * Optional "Number of stakeholders" input. Empty means no N is stored.
 * After the number changes on a survey whose questions already have ratings,
 * says the old scores still use the previous number and offers to rescore.
 */
export default function StakeholderCountField({
	value,
	onChange,
	surveyId,
	questionIds,
	isSaved,
}: StakeholderCountFieldProps) {
	const { t } = useTranslation();
	const ratedQuestionIds = useRatedQuestionIds(surveyId, questionIds);
	const [scoredWith, setScoredWith] = useState<number | undefined>(value);
	const [status, setStatus] = useState<RecalcStatus>('idle');
	const isStale = ratedQuestionIds.length > 0 && value !== scoredWith;

	const handleRecalculate = async (): Promise<void> => {
		if (!surveyId) return;
		setStatus('running');
		const { failedQuestionIds } = await recalculateQuestions(surveyId, ratedQuestionIds);
		if (failedQuestionIds.length > 0) {
			setStatus('failed');

			return;
		}
		setScoredWith(value);
		setStatus('done');
	};

	return (
		<div className={styles.field}>
			<div className={styles.field__header}>
				<label htmlFor="stakeholderCount" className={styles.field__label}>
					{t('Number of stakeholders')}
				</label>
				<span className={styles.field__optional}>{t('Optional')}</span>
			</div>
			<input
				id="stakeholderCount"
				type="number"
				inputMode="numeric"
				min={1}
				step={1}
				className={styles.field__input}
				value={value ?? ''}
				aria-describedby="stakeholderCountHint"
				onChange={(e) => onChange(parseTargetPopulation(e.target.value))}
			/>
			<p id="stakeholderCountHint" className={styles.field__hint}>
				{t('survey.stakeholders.hint')}
			</p>
			{isStale && (
				<div className={styles.field__stale} role="status">
					<p className={styles.field__staleText}>{t('survey.stakeholders.stale')}</p>
					<button
						type="button"
						className={styles.field__action}
						disabled={!isSaved || status === 'running'}
						onClick={handleRecalculate}
					>
						{status === 'running'
							? t('survey.stakeholders.recalculating')
							: t('survey.stakeholders.recalculate')}
					</button>
				</div>
			)}
			{status === 'failed' && (
				<p className={styles.field__error} role="alert">
					{t('survey.stakeholders.recalculateFailed')}
				</p>
			)}
			{status === 'done' && !isStale && (
				<p className={styles.field__done} role="status">
					{t('survey.stakeholders.recalculated')}
				</p>
			)}
		</div>
	);
}
