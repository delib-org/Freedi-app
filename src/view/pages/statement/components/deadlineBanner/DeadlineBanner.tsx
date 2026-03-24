import React, { FC, useState, useRef, useEffect } from 'react';
import { Statement, Role } from '@freedi/shared-types';
import { useQuestionDeadline } from '@/controllers/hooks/useQuestionDeadline';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { formatTimeRemaining } from '@/helpers/deadlineHelpers';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { setDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { TIME } from '@/constants/common';
import {
	Clock,
	AlertCircle,
	Pause,
	Play,
	X,
	TimerReset,
	ChevronDown,
	ChevronUp,
	Timer,
	OctagonX,
} from 'lucide-react';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';

interface DeadlineBannerProps {
	statement: Statement | undefined;
	role: Role | undefined;
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

const MAX_DAYS = 99;
const MAX_HOURS = 23;
const MAX_MINUTES = 59;

const WARNING_THRESHOLD = 2 * TIME.HOUR;
const URGENT_THRESHOLD = 5 * TIME.MINUTE;

function getUrgencyLevel(timeRemainingMs: number, isRunning: boolean): 'normal' | 'warning' | 'urgent' {
	if (!isRunning) return 'normal';
	if (timeRemainingMs <= URGENT_THRESHOLD) return 'urgent';
	if (timeRemainingMs <= WARNING_THRESHOLD) return 'warning';

	return 'normal';
}

/** Play a short beep using the Web Audio API */
function playBeep(frequency: number, duration: number, volume = 0.3) {
	try {
		const ctx = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)();
		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();

		oscillator.connect(gain);
		gain.connect(ctx.destination);

		oscillator.frequency.value = frequency;
		oscillator.type = 'sine';
		gain.gain.value = volume;
		gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

		oscillator.start(ctx.currentTime);
		oscillator.stop(ctx.currentTime + duration);

		setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
	} catch {
		// Audio not available
	}
}

function playWarningSound() {
	playBeep(660, 0.15, 0.2);
}

function playUrgentSound() {
	playBeep(880, 0.1, 0.25);
	setTimeout(() => playBeep(880, 0.1, 0.25), 150);
}

function playExpiredSound() {
	playBeep(440, 0.2, 0.3);
	setTimeout(() => playBeep(330, 0.3, 0.3), 250);
}

function msToSegments(ms: number): DurationSegments {
	const totalMinutes = Math.floor(ms / TIME.MINUTE);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;

	return { days, hours, minutes };
}

function segmentsToMs(segments: DurationSegments): number {
	return segments.days * TIME.DAY + segments.hours * TIME.HOUR + segments.minutes * TIME.MINUTE;
}

function clampValue(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

const DeadlineBanner: FC<DeadlineBannerProps> = ({ statement, role }) => {
	const { t } = useTranslation();
	const { deadline, isPaused, remainingMsAtPause, isExpired, timeRemainingMs } =
		useQuestionDeadline(statement);
	const [showSetup, setShowSetup] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [segments, setSegments] = useState<DurationSegments>({
		days: 0,
		hours: 0,
		minutes: 30,
	});

	const daysRef = useRef<HTMLInputElement>(null);
	const hoursRef = useRef<HTMLInputElement>(null);
	const minutesRef = useRef<HTMLInputElement>(null);

	const isAdmin = role === Role.admin || role === Role.creator;
	const { isHalted, isManuallyHalted } = useIsProcessHalted(statement);

	// Determine the timer state
	const hasTimer = Boolean(deadline);
	const isRunning = hasTimer && !isPaused && !isExpired;
	const totalMs = segmentsToMs(segments);
	const canStart = totalMs > 0;
	const urgency = getUrgencyLevel(timeRemainingMs, isRunning);

	// Track previous urgency level to play sounds at transitions
	const prevUrgencyRef = useRef<'normal' | 'warning' | 'urgent'>('normal');
	const prevExpiredRef = useRef(false);

	useEffect(() => {
		if (!isRunning) {
			prevUrgencyRef.current = 'normal';
			prevExpiredRef.current = isExpired;

			return;
		}

		// Sound on urgency transition
		if (urgency !== prevUrgencyRef.current) {
			if (urgency === 'warning' && prevUrgencyRef.current === 'normal') {
				playWarningSound();
			} else if (urgency === 'urgent' && prevUrgencyRef.current !== 'urgent') {
				playUrgentSound();
			}
			prevUrgencyRef.current = urgency;
		}
	}, [urgency, isRunning, isExpired]);

	// Sound when timer expires
	useEffect(() => {
		if (isExpired && !prevExpiredRef.current && hasTimer) {
			playExpiredSound();
		}
		prevExpiredRef.current = isExpired;
	}, [isExpired, hasTimer]);

	// Reset segments when setup panel opens
	useEffect(() => {
		if (showSetup) {
			setSegments({ days: 0, hours: 0, minutes: 30 });
		}
	}, [showSetup]);

	// Non-admin: show halted banner if halted, nothing if no timer and not halted
	if (!isAdmin && !hasTimer && !isHalted) return null;
	if (!isAdmin && !hasTimer && isManuallyHalted) {
		return (
			<div className="deadline-banner deadline-banner--halted" role="status">
				<div className="deadline-banner__status">
					<span className="deadline-banner__icon" aria-hidden="true">
						<OctagonX size={18} />
					</span>
					<span className="deadline-banner__text">
						{t('Process halted')}
					</span>
				</div>
			</div>
		);
	}

	function handleSegmentChange(field: keyof DurationSegments, rawValue: string) {
		const parsed = parseInt(rawValue, 10);
		const value = isNaN(parsed) ? 0 : parsed;

		const maxMap: Record<keyof DurationSegments, number> = {
			days: MAX_DAYS,
			hours: MAX_HOURS,
			minutes: MAX_MINUTES,
		};

		setSegments((prev) => ({
			...prev,
			[field]: clampValue(value, 0, maxMap[field]),
		}));
	}

	function handlePresetClick(ms: number) {
		setSegments(msToSegments(ms));
	}

	function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
		e.target.select();
	}

	async function handleSetDeadline(durationMs: number) {
		if (!statement) return;
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			const now = getCurrentTimestamp();
			await setDoc(
				ref,
				{
					questionSettings: {
						deadline: now + durationMs,
						durationMs,
						pausedAt: null,
						remainingMsAtPause: null,
					},
					lastUpdate: now,
				},
				{ merge: true },
			);
			setShowSetup(false);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineBanner.handleSetDeadline',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	async function handleStartTimer() {
		if (!statement || !canStart) return;
		const durationMs = segmentsToMs(segments);
		await handleSetDeadline(durationMs);
	}

	function handleInputKeyDown(
		e: React.KeyboardEvent<HTMLInputElement>,
		field: keyof DurationSegments,
	) {
		// On Enter, start the timer if valid
		if (e.key === 'Enter' && canStart) {
			e.preventDefault();
			handleStartTimer();

			return;
		}

		// Arrow key navigation between segments (RTL-aware)
		const fieldOrder: (keyof DurationSegments)[] = ['days', 'hours', 'minutes'];
		const refMap: Record<keyof DurationSegments, React.RefObject<HTMLInputElement | null>> = {
			days: daysRef,
			hours: hoursRef,
			minutes: minutesRef,
		};
		const idx = fieldOrder.indexOf(field);

		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			const direction =
				e.key === 'ArrowRight'
					? document.dir === 'rtl'
						? -1
						: 1
					: document.dir === 'rtl'
						? 1
						: -1;
			const nextIdx = idx + direction;
			if (nextIdx >= 0 && nextIdx < fieldOrder.length) {
				e.preventDefault();
				refMap[fieldOrder[nextIdx]]?.current?.focus();
			}
		}
	}

	async function handlePause() {
		if (!statement) return;
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			const now = getCurrentTimestamp();
			const remaining = Math.max(0, (deadline ?? 0) - now);
			await setDoc(
				ref,
				{
					questionSettings: {
						pausedAt: now,
						remainingMsAtPause: remaining,
					},
					lastUpdate: now,
				},
				{ merge: true },
			);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineBanner.handlePause',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	async function handleResume() {
		if (!statement || !remainingMsAtPause) return;
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			const now = getCurrentTimestamp();
			await setDoc(
				ref,
				{
					questionSettings: {
						deadline: now + remainingMsAtPause,
						pausedAt: null,
						remainingMsAtPause: null,
					},
					lastUpdate: now,
				},
				{ merge: true },
			);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineBanner.handleResume',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	async function handleHaltProcess() {
		if (!statement) return;
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			const now = getCurrentTimestamp();
			await setDoc(
				ref,
				{
					questionSettings: { isHalted: true, haltedAt: now },
					lastUpdate: now,
				},
				{ merge: true },
			);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineBanner.handleHaltProcess',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	async function handleResumeProcess() {
		if (!statement) return;
		setIsSaving(true);
		try {
			const ref = createStatementRef(statement.statementId);
			await setDoc(
				ref,
				{
					questionSettings: { isHalted: null, haltedAt: null },
					lastUpdate: getCurrentTimestamp(),
				},
				{ merge: true },
			);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineBanner.handleResumeProcess',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	async function handleRemove() {
		if (!statement) return;
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
			setShowSetup(false);
		} catch (error) {
			logError(error, {
				operation: 'DeadlineBanner.handleRemove',
				statementId: statement.statementId,
			});
		}
		setIsSaving(false);
	}

	// ── Duration input segments (shared between setup and extend) ──
	function renderDurationInput() {
		return (
			<div className="deadline-banner__duration-input">
				<div className="deadline-banner__segments" role="group" aria-label={t('Set duration')}>
					{/* Days */}
					<div className="deadline-banner__segment">
						<input
							ref={daysRef}
							type="number"
							inputMode="numeric"
							className="deadline-banner__segment-value"
							value={segments.days}
							onChange={(e) => handleSegmentChange('days', e.target.value)}
							onFocus={handleInputFocus}
							onKeyDown={(e) => handleInputKeyDown(e, 'days')}
							min={0}
							max={MAX_DAYS}
							aria-label={t('Days')}
							disabled={isSaving}
						/>
						<span className="deadline-banner__segment-unit">{t('d')}</span>
					</div>

					<span className="deadline-banner__segment-separator" aria-hidden="true">
						:
					</span>

					{/* Hours */}
					<div className="deadline-banner__segment">
						<input
							ref={hoursRef}
							type="number"
							inputMode="numeric"
							className="deadline-banner__segment-value"
							value={segments.hours}
							onChange={(e) => handleSegmentChange('hours', e.target.value)}
							onFocus={handleInputFocus}
							onKeyDown={(e) => handleInputKeyDown(e, 'hours')}
							min={0}
							max={MAX_HOURS}
							aria-label={t('Hours')}
							disabled={isSaving}
						/>
						<span className="deadline-banner__segment-unit">{t('h')}</span>
					</div>

					<span className="deadline-banner__segment-separator" aria-hidden="true">
						:
					</span>

					{/* Minutes */}
					<div className="deadline-banner__segment">
						<input
							ref={minutesRef}
							type="number"
							inputMode="numeric"
							className="deadline-banner__segment-value"
							value={segments.minutes}
							onChange={(e) => handleSegmentChange('minutes', e.target.value)}
							onFocus={handleInputFocus}
							onKeyDown={(e) => handleInputKeyDown(e, 'minutes')}
							min={0}
							max={MAX_MINUTES}
							aria-label={t('Minutes')}
							disabled={isSaving}
						/>
						<span className="deadline-banner__segment-unit">{t('m')}</span>
					</div>
				</div>

				{/* Start button */}
				<button
					className={`deadline-banner__start-btn ${!canStart ? 'deadline-banner__start-btn--disabled' : ''}`}
					onClick={handleStartTimer}
					disabled={!canStart || isSaving}
					aria-label={t('Start timer')}
				>
					<Play size={14} />
					<span>{t('Start')}</span>
				</button>
			</div>
		);
	}

	// ── No timer set: show admin trigger + halt controls ──
	if (!hasTimer) {
		return (
			<div className={`deadline-banner deadline-banner--empty ${isManuallyHalted ? 'deadline-banner--halted' : ''}`}>
				{isManuallyHalted && (
					<div className="deadline-banner__status">
						<span className="deadline-banner__text">
							{t('Process halted')}
						</span>
						<div className="deadline-banner__controls">
							<button
								className="phase-admin-controls__btn phase-admin-controls__btn--advance"
								onClick={handleResumeProcess}
								disabled={isSaving}
							>
								{t('Resume process')}
							</button>
						</div>
					</div>
				)}
				{!isManuallyHalted && (
					<div className="deadline-banner__admin-row">
						<button
							className="deadline-banner__trigger"
							onClick={() => setShowSetup((prev) => !prev)}
							aria-expanded={showSetup}
							aria-label={t('Set a timer')}
						>
							<Timer size={16} aria-hidden="true" />
							<span>{t('Set a timer')}</span>
							{showSetup ? (
								<ChevronUp size={14} aria-hidden="true" />
							) : (
								<ChevronDown size={14} aria-hidden="true" />
							)}
						</button>
						<button
							className="phase-admin-controls__btn phase-admin-controls__btn--lock"
							onClick={handleHaltProcess}
							disabled={isSaving}
						>
							{t('Halt process')}
						</button>
					</div>
				)}

				{showSetup && (
					<div className="deadline-banner__setup">
						{/* Duration input */}
						{renderDurationInput()}

						{/* Quick presets */}
						<div className="deadline-banner__presets-section">
							<span className="deadline-banner__presets-label">{t('or')}</span>
							<div
								className="deadline-banner__presets"
								role="group"
								aria-label={t('Timer presets')}
							>
								{PRESETS.map(({ labelKey, ms }) => (
									<button
										key={labelKey}
										className="deadline-banner__preset-chip"
										onClick={() => handlePresetClick(ms)}
										disabled={isSaving}
									>
										{t(labelKey)}
									</button>
								))}
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}

	// ── Timer exists: build modifier class ──
	const modifierClass = isExpired
		? 'deadline-banner--expired'
		: isPaused
			? 'deadline-banner--paused'
			: urgency === 'urgent'
				? 'deadline-banner--urgent'
				: urgency === 'warning'
					? 'deadline-banner--warning'
					: '';

	return (
		<div className={`deadline-banner ${modifierClass}`} role="timer" aria-live="polite">
			{/* ── Status row ── */}
			<div className="deadline-banner__status">
				<span className="deadline-banner__icon" aria-hidden="true">
					{isExpired ? (
						<AlertCircle size={18} />
					) : isPaused ? (
						<Pause size={18} />
					) : (
						<Clock size={18} />
					)}
				</span>
				<span className="deadline-banner__text">
					{isExpired
						? t("Time's up")
						: isPaused
							? `${t('Paused')} - ${formatTimeRemaining(timeRemainingMs)} ${t('remaining')}`
							: `${t('Time remaining')}: ${formatTimeRemaining(timeRemainingMs)}`}
				</span>
			</div>

			{/* ── Admin controls ── */}
			{isAdmin && (
				<div className="deadline-banner__controls">
					{isRunning && (
						<button
							className="phase-admin-controls__btn phase-admin-controls__btn--revert"
							onClick={handlePause}
							disabled={isSaving}
						>
							{t('Pause timer')}
						</button>
					)}

					{isPaused && (
						<button
							className="phase-admin-controls__btn phase-admin-controls__btn--advance"
							onClick={handleResume}
							disabled={isSaving}
						>
							{t('Resume timer')}
						</button>
					)}

					{isExpired && (
						<button
							className="phase-admin-controls__btn phase-admin-controls__btn--advance"
							onClick={() => setShowSetup((prev) => !prev)}
							disabled={isSaving}
						>
							{t('Extend timer')}
						</button>
					)}

					<button
						className="phase-admin-controls__btn phase-admin-controls__btn--revert"
						onClick={handleRemove}
						disabled={isSaving}
					>
						{t('Remove Timer')}
					</button>

					{/* Halt / Resume process */}
					{!isManuallyHalted && !isExpired && (
						<button
							className="phase-admin-controls__btn phase-admin-controls__btn--lock"
							onClick={handleHaltProcess}
							disabled={isSaving}
						>
							{t('Halt process')}
						</button>
					)}
					{isManuallyHalted && (
						<button
							className="phase-admin-controls__btn phase-admin-controls__btn--advance"
							onClick={handleResumeProcess}
							disabled={isSaving}
						>
							{t('Resume process')}
						</button>
					)}
				</div>
			)}

			{/* ── Extend panel (shown after timer expires) ── */}
			{isAdmin && isExpired && showSetup && (
				<div className="deadline-banner__setup">
					{renderDurationInput()}

					<div className="deadline-banner__presets-section">
						<span className="deadline-banner__presets-label">{t('or')}</span>
						<div className="deadline-banner__presets" role="group" aria-label={t('Timer presets')}>
							{PRESETS.map(({ labelKey, ms }) => (
								<button
									key={labelKey}
									className="deadline-banner__preset-chip"
									onClick={() => handlePresetClick(ms)}
									disabled={isSaving}
								>
									{t(labelKey)}
								</button>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default DeadlineBanner;
