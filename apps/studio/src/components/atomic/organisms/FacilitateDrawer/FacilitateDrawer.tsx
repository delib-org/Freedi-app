import { useCallback, useEffect, useId, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ActivityType, type QuestionProgress } from '@freedi/shared-types';
import type { ActivityRunState, DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { ActivityTypeChip } from '@/components/atomic/atoms/ActivityTypeChip';
import { Button } from '@/components/atomic/atoms/Button';
import { ProgressFunnel } from '@/components/atomic/atoms/ProgressFunnel';
import { ProgressStat } from '@/components/atomic/atoms/ProgressStat';
import { StatusPill } from '@/components/atomic/atoms/StatusPill';
import { StatusControl } from '@/components/atomic/molecules/StatusControl';
import { ShareHub } from '@/components/atomic/molecules/ShareHub';
import { NudgeComposer, type NudgePayload } from '@/components/atomic/molecules/NudgeComposer';
import { useDialogMechanics } from '@/utils/dialogMechanics';
import { formatRelativeTime } from '@/utils/relativeTime';
import { logError } from '@/utils/logError';
import { useMediaQuery, MEDIA_MOBILE } from '@/components/atomic/organisms/AppShell/useMediaQuery';

/**
 * FacilitateDrawer Organism — everything a facilitator does to ONE activity:
 * status, share, progress, nudge, advanced links, reorder / archive.
 * Styles: styles/organisms/_drawer.scss (.drawer)
 *
 * Dialog mechanics (portal, focus trap, Esc, backdrop, body lock, inert root,
 * focus restore) come from `useDialogMechanics`, copied from the main app's
 * Modal. On mobile it renders as a bottom sheet.
 */
export interface FacilitateDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	activity: DerivedActivity;
	/** Zero-based position in the agenda — shown as "n of N". */
	index: number;
	total: number;
	progress?: QuestionProgress;
	status: ActivityRunState;
	onStatusChange: (next: ActivityRunState) => Promise<void> | void;
	onNudge: (payload: NudgePayload) => Promise<void>;
	onMove: (direction: 'up' | 'down') => Promise<void> | void;
	onArchive: () => Promise<void> | void;
	/** Join activities: route of the live run view (`run/:id`). */
	runHref?: string;
	/** MC activity without a survey yet → MC's pre-seeded "new survey" page. */
	setupSurveyHref?: string;
	/** Viewer mode — no status control, nudge, or agenda menu. */
	readOnly?: boolean;
	/** Element to return focus to on close (defaults to the previously focused one). */
	returnFocusTo?: HTMLElement | null;
	/** Whether the org has email nudges available (default true). */
	emailEnabled?: boolean;
}

/** Human app name for the "opens in …" caption of the admin link. */
const APP_NAMES: Record<DerivedActivity['def']['sourceApp'], string> = {
	main: 'WizCol',
	'mass-consensus': 'Crowd Consensus',
	sign: 'WizCol Sign',
	join: 'WizCol Join',
	flow: 'WizCol Flow',
	chat: 'WizCol Chat',
	agora: 'Agora',
};

const FacilitateDrawer: FC<FacilitateDrawerProps> = ({
	isOpen,
	onClose,
	activity,
	index,
	total,
	progress,
	status,
	onStatusChange,
	onNudge,
	onMove,
	onArchive,
	runHref,
	setupSurveyHref,
	readOnly = false,
	returnFocusTo,
	emailEnabled = true,
}) => {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const navigate = useNavigate();
	const isMobile = useMediaQuery(MEDIA_MOBILE);
	const titleId = useId();
	const nudgeId = useId();

	const panelRef = useRef<HTMLDivElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const nudgeRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const [statusBusy, setStatusBusy] = useState(false);
	const [nudgeOpen, setNudgeOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [busyAction, setBusyAction] = useState<'move' | 'archive' | null>(null);

	useDialogMechanics({
		isOpen,
		onClose,
		panelRef,
		initialFocusRef: titleRef,
		returnFocusTo,
	});

	// Reset transient state whenever a different activity is shown.
	useEffect(() => {
		setNudgeOpen(false);
		setMenuOpen(false);
	}, [activity.statementId, isOpen]);

	useEffect(() => {
		if (!menuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
		};
		document.addEventListener('pointerdown', handlePointerDown);

		return () => document.removeEventListener('pointerdown', handlePointerDown);
	}, [menuOpen]);

	const handleStatusChange = useCallback(
		async (next: ActivityRunState) => {
			setStatusBusy(true);
			try {
				await onStatusChange(next);
			} catch (error) {
				logError(error, {
					operation: 'FacilitateDrawer.statusChange',
					statementId: activity.statementId,
					metadata: { next },
				});
			} finally {
				setStatusBusy(false);
			}
		},
		[onStatusChange, activity.statementId],
	);

	const runAction = async (action: 'move' | 'archive', fn: () => Promise<void> | void) => {
		setMenuOpen(false);
		setBusyAction(action);
		try {
			await fn();
		} catch (error) {
			logError(error, {
				operation: `FacilitateDrawer.${action}`,
				statementId: activity.statementId,
			});
		} finally {
			setBusyAction(null);
		}
	};

	const openNudge = () => {
		setNudgeOpen(true);
		window.setTimeout(() => nudgeRef.current?.scrollIntoView({ block: 'nearest' }), 0);
	};

	if (!isOpen) return null;

	const isSignDocument = activity.type === ActivityType.signDocument;
	const isJoin = activity.type === ActivityType.join;
	const counts = {
		entered: progress?.entered ?? 0,
		suggested: progress?.suggested ?? 0,
		evaluated: progress?.evaluated ?? 0,
	};
	const idle = Math.max(0, counts.entered - Math.max(counts.suggested, counts.evaluated));
	const nudgeCounts = {
		all: counts.entered,
		notSuggested: Math.max(0, counts.entered - counts.suggested),
		notEvaluated: Math.max(0, counts.entered - counts.evaluated),
	};
	const appName = APP_NAMES[activity.def.sourceApp] ?? 'WizCol';

	const drawer = (
		<div
			className={clsx('drawer', isOpen && 'drawer--open', isMobile && 'drawer--sheet')}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
		>
			<div className="drawer__backdrop" onClick={onClose} aria-hidden="true" />

			<div className="drawer__panel" ref={panelRef} tabIndex={-1}>
				<header className="drawer__header">
					<div className="drawer__eyebrow">
						<ActivityTypeChip type={activity.type} />
						<span className="drawer__position">
							{tWithParams('{{n}} of {{total}}', { n: index + 1, total })}
						</span>
					</div>
					<h2 id={titleId} ref={titleRef} className="drawer__title" tabIndex={-1} dir="auto">
						{activity.title || t('Untitled')}
					</h2>
					<button type="button" className="drawer__close" aria-label={t('Close')} onClick={onClose}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</header>

				<div className="drawer__body">
					{isJoin && runHref && (
						<div className="drawer__run">
							<Button
								text={t('Run view')}
								variant="primary"
								fullWidth
								onClick={() => navigate(runHref)}
							/>
						</div>
					)}

					{activity.type === ActivityType.massConsensus &&
						!activity.surveyId &&
						setupSurveyHref &&
						!readOnly && (
							<div className="drawer__run">
								<Button
									text={t('Set up the full survey')}
									variant="primary"
									fullWidth
									onClick={() => window.location.assign(setupSurveyHref)}
								/>
								<p className="drawer__hint">
									{t('Questions, demographics, logos and results are configured in Crowd survey.')}
								</p>
							</div>
						)}

					{/* 1. Status */}
					<section className="drawer__section" aria-labelledby={`${titleId}-status`}>
						<h3 id={`${titleId}-status`} className="drawer__section-title">
							{t('Status')}
						</h3>
						{isSignDocument ? (
							<p className="drawer__static">{t('Documents are always open while shared')}</p>
						) : readOnly ? (
							<StatusPill status={status} />
						) : (
							<StatusControl value={status} onChange={handleStatusChange} busy={statusBusy} />
						)}
					</section>

					{/* 2. Share */}
					<section className="drawer__section" aria-labelledby={`${titleId}-share`}>
						<h3 id={`${titleId}-share`} className="drawer__section-title">
							{t('Share')}
						</h3>
						<ShareHub activities={[activity]} embedded title="" />
					</section>

					{/* 3. Progress */}
					<section className="drawer__section" aria-labelledby={`${titleId}-progress`}>
						<h3 id={`${titleId}-progress`} className="drawer__section-title">
							{t('Progress')}
						</h3>
						<div className="drawer__stats">
							<ProgressStat value={counts.entered} label={t('Entered')} accent="entered" compact />
							<ProgressStat
								value={counts.suggested}
								label={t('Suggested')}
								accent="suggested"
								compact
							/>
							<ProgressStat
								value={counts.evaluated}
								label={t('Evaluated')}
								accent="evaluated"
								compact
							/>
						</div>
						<ProgressFunnel counts={counts} variant="full" />
						{progress && progress.lastActivity > 0 ? (
							<p className="drawer__last-activity">
								{tWithParams('Last activity {{ago}}', {
									ago: formatRelativeTime(progress.lastActivity, currentLanguage),
								})}
							</p>
						) : (
							<p className="drawer__last-activity">{t('No activity yet')}</p>
						)}
						{!readOnly && idle > 0 && (
							<div className="drawer__idle">
								<span>
									{tWithParams("{{count}} entered but haven't done anything yet", { count: idle })}
								</span>
								<Button
									text={t('Send them an update')}
									variant="secondary"
									size="small"
									onClick={openNudge}
								/>
							</div>
						)}
					</section>

					{/* 4. Nudge */}
					{!readOnly && (
						<section className="drawer__section" ref={nudgeRef}>
							<button
								type="button"
								className="drawer__toggle"
								aria-expanded={nudgeOpen}
								aria-controls={nudgeId}
								onClick={() => setNudgeOpen((v) => !v)}
							>
								<span>{t('Send an update')}</span>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									aria-hidden="true"
								>
									<polyline points="6 9 12 15 18 9" />
								</svg>
							</button>
							{nudgeOpen && (
								<div id={nudgeId}>
									<NudgeComposer
										inline
										counts={nudgeCounts}
										lastNudgeAt={progress?.lastNudgeAt}
										emailEnabled={emailEnabled}
										onSend={onNudge}
										onCancel={() => setNudgeOpen(false)}
									/>
								</div>
							)}
						</section>
					)}

					{/* 5. Advanced */}
					<section className="drawer__section" aria-labelledby={`${titleId}-advanced`}>
						<h3 id={`${titleId}-advanced`} className="drawer__section-title">
							{t('Advanced')}
						</h3>
						<div className="drawer__links">
							{activity.participant && (
								<a
									className="drawer__link"
									href={activity.participant.href}
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('Open as participant')}
									<span className="drawer__caption">{t('new tab')}</span>
								</a>
							)}
							{activity.admin && (
								<a
									className="drawer__link"
									href={activity.admin.href}
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('Advanced settings')}
									<span className="drawer__caption">
										{t('opens in')} {appName}
									</span>
								</a>
							)}
						</div>

						{!readOnly && (
							<div className="drawer__menu-anchor" ref={menuRef}>
								<button
									type="button"
									className="drawer__menu-button"
									aria-haspopup="menu"
									aria-expanded={menuOpen}
									aria-label={t('More actions')}
									disabled={busyAction !== null}
									onClick={() => setMenuOpen((v) => !v)}
								>
									⋯
								</button>
								{menuOpen && (
									<div className="drawer__menu" role="menu" aria-label={t('More actions')}>
										<button
											type="button"
											role="menuitem"
											className="drawer__menu-item"
											disabled={index === 0}
											onClick={() => void runAction('move', () => onMove('up'))}
										>
											{t('Move up')}
										</button>
										<button
											type="button"
											role="menuitem"
											className="drawer__menu-item"
											disabled={index >= total - 1}
											onClick={() => void runAction('move', () => onMove('down'))}
										>
											{t('Move down')}
										</button>
										<button
											type="button"
											role="menuitem"
											className="drawer__menu-item drawer__menu-item--danger"
											onClick={() => void runAction('archive', onArchive)}
										>
											{t('Archive')}
										</button>
									</div>
								)}
							</div>
						)}
					</section>
				</div>

				<footer className="drawer__footer">
					<Button text={t('Done')} variant="secondary" onClick={onClose} />
				</footer>
			</div>
		</div>
	);

	return createPortal(drawer, document.body);
};

export default FacilitateDrawer;
