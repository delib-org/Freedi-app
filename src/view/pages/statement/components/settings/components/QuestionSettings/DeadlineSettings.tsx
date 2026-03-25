import React, { FC, useState, useRef } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { setDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { formatTimeRemaining } from '@/helpers/deadlineHelpers';
import { TIME } from '@/constants/common';
import { Clock } from 'lucide-react';
import styles from './QuestionSettings.module.scss';

interface DeadlineSettingsProps {
	statement: Statement;
}

interface DurationSegments {
	days: number;
	hours: number;
	minutes: number;
}

const PRESETS = [
	{ labelKey: '15 min', ms: 15 * TIME.MINUTE },
	{ labelKey: '30 min', ms: 30 * TIME.MINUTE },
	{ labelKey: '1 hour', ms: TIME.HOUR },
	{ labelKey: '2 hours', ms: 2 * TIME.HOUR },
	{ labelKey: '1 day', ms: TIME.DAY },
	{ labelKey: '3 days', ms: 3 * TIME.DAY },
	{ labelKey: '1 week', ms: TIME.WEEK },
] as const;

function msToSegments(ms: number): DurationSegments {
	const totalMinutes = Math.floor(ms / TIME.MINUTE);

	return {
		days: Math.floor(totalMinutes / (24 * 60)),
		hours: Math.floor((totalMinutes % (24 * 60)) / 60),
		minutes: totalMinutes % 60,
	};
}

function segmentsToMs(seg: DurationSegments): number {
	return (seg.days * 24 * 60 + seg.hours * 60 + seg.minutes) * TIME.MINUTE;
}

function clamp(value: number, max: number): number {
	return Math.max(0, Math.min(max, value));
}

const DeadlineSettings: FC<DeadlineSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const [isSaving, setIsSaving] = useState(false);
	const [segments, setSegments] = useState<DurationSegments>({ days: 0, hours: 0, minutes: 30 });
	const daysRef = useRef<HTMLInputElement>(null);
	const hoursRef = useRef<HTMLInputElement>(null);
	const minutesRef = useRef<HTMLInputElement>(null);

	const currentDeadline = statement.questionSettings?.deadline;
	const isPaused = Boolean(statement.questionSettings?.pausedAt);
	const remainingAtPause = statement.questionSettings?.remainingMsAtPause;
	const isActive = currentDeadline && !isPaused && currentDeadline > Date.now();
	const timeLeft =
		isPaused && remainingAtPause
			? remainingAtPause
			: currentDeadline
				? Math.max(0, currentDeadline - Date.now())
				: 0;

	const totalMs = segmentsToMs(segments);

	function handleSegmentChange(field: keyof DurationSegments, value: string, max: number) {
		const num = parseInt(value, 10);
		setSegments((prev) => ({
			...prev,
			[field]: isNaN(num) ? 0 : clamp(num, max),
		}));
	}

	function handlePresetClick(ms: number) {
		setSegments(msToSegments(ms));
	}

	async function handleStart() {
		if (totalMs <= 0) return;
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			const now = getCurrentTimestamp();
			await setDoc(
				ref,
				{
					questionSettings: {
						deadline: now + totalMs,
						durationMs: totalMs,
						pausedAt: null,
						remainingMsAtPause: null,
					},
					lastUpdate: now,
				},
				{ merge: true },
			);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineSettings.handleStart',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	async function handleRemove() {
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			await setDoc(
				ref,
				{
					questionSettings: {
						deadline: null,
						durationMs: null,
						pausedAt: null,
						remainingMsAtPause: null,
					},
					lastUpdate: getCurrentTimestamp(),
				},
				{ merge: true },
			);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineSettings.handleRemove',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	function handleKeyDown(
		e: React.KeyboardEvent,
		nextRef?: React.RefObject<HTMLInputElement | null>,
	) {
		if (e.key === 'Enter') {
			handleStart();
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			nextRef?.current?.focus();
		}
	}

	return (
		<div className={styles.deadlineSettings}>
			{(isActive || isPaused) && (
				<div className={styles.deadlineActive}>
					<Clock size={16} />
					<span>
						{isPaused
							? `${t('Paused')} - ${formatTimeRemaining(timeLeft)} ${t('remaining')}`
							: `${t('Time remaining')}: ${formatTimeRemaining(timeLeft)}`}
					</span>
				</div>
			)}

			<div className={styles.deadlineInputRow}>
				<div className={styles.deadlineSegments} role="group" aria-label={t('Set duration')}>
					<div className={styles.deadlineSegment}>
						<input
							ref={daysRef}
							type="number"
							inputMode="numeric"
							className={styles.deadlineSegmentValue}
							value={segments.days}
							onChange={(e) => handleSegmentChange('days', e.target.value, 99)}
							onFocus={(e) => e.target.select()}
							onKeyDown={(e) => handleKeyDown(e, hoursRef)}
							min={0}
							max={99}
							aria-label={t('Days')}
						/>
						<span className={styles.deadlineSegmentUnit}>{t('d')}</span>
					</div>
					<span className={styles.deadlineSegmentSep} aria-hidden="true">
						:
					</span>
					<div className={styles.deadlineSegment}>
						<input
							ref={hoursRef}
							type="number"
							inputMode="numeric"
							className={styles.deadlineSegmentValue}
							value={segments.hours}
							onChange={(e) => handleSegmentChange('hours', e.target.value, 23)}
							onFocus={(e) => e.target.select()}
							onKeyDown={(e) => handleKeyDown(e, minutesRef)}
							min={0}
							max={23}
							aria-label={t('Hours')}
						/>
						<span className={styles.deadlineSegmentUnit}>{t('h')}</span>
					</div>
					<span className={styles.deadlineSegmentSep} aria-hidden="true">
						:
					</span>
					<div className={styles.deadlineSegment}>
						<input
							ref={minutesRef}
							type="number"
							inputMode="numeric"
							className={styles.deadlineSegmentValue}
							value={segments.minutes}
							onChange={(e) => handleSegmentChange('minutes', e.target.value, 59)}
							onFocus={(e) => e.target.select()}
							onKeyDown={(e) => handleKeyDown(e, daysRef)}
							min={0}
							max={59}
							aria-label={t('Minutes')}
						/>
						<span className={styles.deadlineSegmentUnit}>{t('m')}</span>
					</div>
				</div>

				<button
					className={styles.deadlineStartBtn}
					onClick={handleStart}
					disabled={isSaving || totalMs <= 0}
				>
					{t('Start timer')}
				</button>
			</div>

			<div className={styles.deadlinePresets}>
				{PRESETS.map(({ labelKey, ms }) => (
					<button
						key={labelKey}
						className={styles.deadlinePresetBtn}
						onClick={() => handlePresetClick(ms)}
						disabled={isSaving}
					>
						{t(labelKey)}
					</button>
				))}
			</div>

			{currentDeadline && (
				<button className={styles.deadlineRemoveBtn} onClick={handleRemove} disabled={isSaving}>
					{t('Remove Timer')}
				</button>
			)}
		</div>
	);
};

export default DeadlineSettings;
