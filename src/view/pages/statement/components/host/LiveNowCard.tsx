import { FC, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ChevronDown, Clock, KeyRound, PieChart, Radio, Share2, Vote } from 'lucide-react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { buildStatementPath } from '@/routes/statementPaths';
import { formatTimeRemaining } from '@/helpers/deadlineHelpers';
import Chip from '@/view/components/atomic/atoms/Chip/Chip';
import ShareModal from '@/view/components/shareModal/ShareModal';
import InvitePanel from '../header/invitePanel/InvitePanel';
import ToggleSwitch from '../settings/components/advancedSettings/ToggleSwitch';
import AllowAddAnswersToggle from '../settings/components/allowAddAnswers/AllowAddAnswersToggle';
import SavedFlash from '../settings/components/savedFlash/SavedFlash';
import DeadlineSettings from '../settings/components/QuestionSettings/DeadlineSettings';
import { useStatementSettingsHandlers } from '../settings/useStatementSettingsHandlers';
import { defaultStatementSettings } from '../settings/emptyStatementModel';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';
import { buildHostHubPath } from './hostHubLogic';
import styles from './HostHub.module.scss';

const SAVED_FLASH_MS = 1600;
const toggleWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface LiveNowCardProps {
	statement: Statement;
	/** The one-row strip under the question header (desktop). */
	compact?: boolean;
}

/**
 * What a facilitator flips while the room is live: Presenter mode, PIN + QR,
 * accepting answers / responses, live results, close date. The full card is
 * the hub's first section; `compact` is the same controls as chips under the
 * question header so nobody has to leave the room.
 */
const LiveNowCard: FC<LiveNowCardProps> = ({ statement: propStatement, compact = false }) => {
	const { t } = useTranslation();
	const { pathname } = useLocation();
	const liveStatement = useAppSelector(statementSelector(propStatement.statementId));
	const statement = liveStatement ?? propStatement;
	// Presenter mode is stored on the top parent (the whole space follows).
	const topParent = useAppSelector(statementSelector(statement.topParentId));
	const presenterTarget = topParent ?? statement;
	const settings = statement.statementSettings ?? defaultStatementSettings;
	const handlers = useStatementSettingsHandlers(statement);

	const [showPin, setShowPin] = useState(false);
	// The strip starts collapsed: seven always-on chips outweighed the question
	// itself, and a facilitator only reaches for them at moments they choose.
	const [stripOpen, setStripOpen] = useState(false);
	const [showShare, setShowShare] = useState(false);
	const [savedField, setSavedField] = useState<string | null>(null);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(flashTimer.current), []);

	function flashSaved(field: string) {
		clearTimeout(flashTimer.current);
		setSavedField(field);
		flashTimer.current = setTimeout(() => setSavedField(null), SAVED_FLASH_MS);
	}

	const presenterOn = Boolean(presenterTarget.powerFollowMe);
	const isQuestion = statement.statementType === StatementType.question;
	const deadline = statement.questionSettings?.deadline;
	const shareUrl = buildStatementPath({ statementId: statement.statementId });

	function togglePresenter(next: boolean) {
		handlers.handlePowerFollowMeChange(next);
		flashSaved('presenter');
	}

	function toggleSetting(key: 'enableEvaluation' | 'showEvaluation', next: boolean) {
		handlers.handleSettingChange(key, next);
		flashSaved(key);
	}

	const modals = (
		<>
			{showPin && (
				<InvitePanel
					setShowModal={setShowPin}
					statementId={statement.statementId}
					pathname={pathname}
				/>
			)}
			<ShareModal
				isOpen={showShare}
				onClose={() => setShowShare(false)}
				url={shareUrl}
				title={t('Share this link')}
			/>
		</>
	);

	if (compact) {
		const liveOn = [
			presenterOn && t('host.presenterMode'),
			(settings.enableEvaluation ?? true) && t('host.acceptingResponses'),
			(settings.showEvaluation ?? false) && t('Show live results'),
		].filter(Boolean) as string[];

		return (
			<div className={styles.strip} data-testid="host-live-strip">
				<button
					type="button"
					className={styles.stripToggle}
					aria-expanded={stripOpen}
					onClick={() => setStripOpen((v) => !v)}
					data-testid="host-live-strip-toggle"
				>
					<Radio size={14} aria-hidden="true" />
					<span className={styles.stripLabel}>{t('host.live')}</span>
					<span className={styles.stripSummary}>
						{liveOn.length > 0 ? liveOn.join(' · ') : t('host.nothingLive')}
					</span>
					<ChevronDown
						size={16}
						aria-hidden="true"
						className={stripOpen ? styles.stripChevronOpen : styles.stripChevron}
					/>
				</button>
				{stripOpen && (
					<div className={styles.stripControls}>
						<Chip
							label={t('host.presenterMode')}
							icon={<Radio size={14} aria-hidden="true" />}
							selected={presenterOn}
							onClick={() => togglePresenter(!presenterOn)}
							ariaLabel={t('host.presenterMode')}
						/>
						<Chip
							label={t('host.acceptingResponses')}
							icon={<Vote size={14} aria-hidden="true" />}
							selected={settings.enableEvaluation ?? true}
							onClick={() =>
								toggleSetting('enableEvaluation', !(settings.enableEvaluation ?? true))
							}
						/>
						<Chip
							label={t('Show live results')}
							icon={<PieChart size={14} aria-hidden="true" />}
							selected={settings.showEvaluation ?? false}
							onClick={() => toggleSetting('showEvaluation', !(settings.showEvaluation ?? false))}
						/>
						<Chip
							label={t('host.showPin')}
							icon={<KeyRound size={14} aria-hidden="true" />}
							muted
							onClick={() => setShowPin(true)}
						/>
						<Chip
							label={t('Share')}
							icon={<Share2 size={14} aria-hidden="true" />}
							muted
							onClick={() => setShowShare(true)}
						/>
						{typeof deadline === 'number' && (
							<Chip
								label={formatTimeRemaining(Math.max(0, deadline - Date.now()))}
								icon={<Clock size={14} aria-hidden="true" />}
								muted
							/>
						)}
						<a className={styles.linkButton} href={buildHostHubPath(statement.statementId, 'live')}>
							{t('host.allHostTools')}
						</a>
						<SavedFlash active={savedField !== null} />
					</div>
				)}
				{modals}
			</div>
		);
	}

	return (
		<div className={styles.liveGrid} data-testid="host-live-now">
			<div className={styles.liveActions}>
				<button type="button" className={styles.linkButton} onClick={() => setShowPin(true)}>
					<KeyRound size={16} aria-hidden="true" />
					{t('host.showPin')}
				</button>
				<button type="button" className={styles.linkButton} onClick={() => setShowShare(true)}>
					<Share2 size={16} aria-hidden="true" />
					{t('host.shareQr')}
				</button>
			</div>
			<div className={toggleWrapClass}>
				<ToggleSwitch
					isChecked={presenterOn}
					onChange={togglePresenter}
					label={t('host.presenterMode')}
					description={t('host.presenterModeDesc')}
					icon={Radio}
					data-testid="presenter-mode"
				/>
				<SavedFlash active={savedField === 'presenter'} />
				{isQuestion && (
					<AllowAddAnswersToggle
						statement={statement}
						handleSettingChange={handlers.handleSettingChange}
						onSaved={() => flashSaved('allowAdd')}
					/>
				)}
				{isQuestion && <SavedFlash active={savedField === 'allowAdd'} />}
				<ToggleSwitch
					isChecked={settings.enableEvaluation ?? true}
					onChange={(checked) => toggleSetting('enableEvaluation', checked)}
					label={t('host.acceptingResponses')}
					description={t('Off = participants can see but not rate or vote')}
					icon={Vote}
					data-testid="accepting-responses"
				/>
				<SavedFlash active={savedField === 'enableEvaluation'} />
				<ToggleSwitch
					isChecked={settings.showEvaluation ?? false}
					onChange={(checked) => toggleSetting('showEvaluation', checked)}
					label={t('Show live results')}
					description={t('Participants see scores while responding (may bias them)')}
					icon={PieChart}
					data-testid="live-results"
				/>
				<SavedFlash active={savedField === 'showEvaluation'} />
			</div>
			{isQuestion && (
				<div className={styles.liveDeadline}>
					<DeadlineSettings statement={statement} />
				</div>
			)}
			{modals}
		</div>
	);
};

export default LiveNowCard;
