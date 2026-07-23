import { FC, useEffect, useRef, useState } from 'react';
import { Zap, MessageCircle, PieChart, Vote, Heart } from 'lucide-react';
import {
	EvaluationUI,
	Statement,
	StatementSettings,
	StatementType,
	evaluationType,
} from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { setParticipationMode, setRatingScale } from '@/controllers/db/evaluation/setEvaluation';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import RatingScaleButtons from '../QuestionSettings/RatingScaleButtons/RatingScaleButtons';
import VotingSettings from '../QuestionSettings/votingSettings/VotingSettings';
import ToggleSwitch from '../advancedSettings/ToggleSwitch';
import { useStatementSettingsHandlers } from '../../useStatementSettingsHandlers';
import { defaultStatementSettings } from '../../emptyStatementModel';
import ConsentIcon from '@/assets/icons/doubleCheckIcon.svg?react';
import SuggestionsIcon from '@/assets/icons/smile.svg?react';
import VotingIcon from '@/assets/icons/votingIcon.svg?react';
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';
import EvaluationsIcon from '@/assets/icons/evaluationsIcon.svg?react';
import styles from './InstantSettings.module.scss';
import advStyles from '../advancedSettings/EnhancedAdvancedSettings.module.scss';

// The shared ToggleSwitch styles are nested under .enhancedSettings in the
// SCSS module — this wrapper provides that context without the old shell.
const toggleWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

const SAVED_FLASH_MS = 1600;

interface InstantSettingsProps {
	statement: Statement;
}

/**
 * The always-visible hero panel at the top of statement settings.
 * Holds the single source of truth for how participants engage:
 * participation mode, rating scale, and the three high-frequency toggles.
 * Everything here saves instantly.
 */
const InstantSettings: FC<InstantSettingsProps> = ({ statement: propStatement }) => {
	const { t } = useTranslation();
	// Prefer the live Redux statement so instant writes reflect back
	// as soon as the snapshot listener fires.
	const liveStatement = useAppSelector(statementSelector(propStatement.statementId));
	const statement = liveStatement ?? propStatement;
	const settings: StatementSettings = statement.statementSettings ?? defaultStatementSettings;
	const { handleSettingChange } = useStatementSettingsHandlers(statement);

	const [savedField, setSavedField] = useState<string | null>(null);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => () => clearTimeout(flashTimer.current), []);

	function flashSaved(field: string) {
		clearTimeout(flashTimer.current);
		setSavedField(field);
		flashTimer.current = setTimeout(() => setSavedField(null), SAVED_FLASH_MS);
	}

	const isQuestion = statement.statementType === StatementType.question;
	const mode = statement.evaluationSettings?.evaluationUI ?? EvaluationUI.suggestions;
	const isVoting = mode === EvaluationUI.voting;
	const showRatingScale = mode === EvaluationUI.suggestions;
	const currentScale = settings.evaluationType ?? evaluationType.range;

	function handleModeChange(value: string) {
		setParticipationMode(statement, value as EvaluationUI);
		flashSaved('mode');
	}

	function handleScaleChange(value: evaluationType) {
		setRatingScale(statement, value);
		flashSaved('scale');
	}

	function toggle(property: 'enableEvaluation' | 'hasChat' | 'showEvaluation', checked: boolean) {
		handleSettingChange(property, checked);
		flashSaved(property);
	}

	const savedPill = (field: string) =>
		savedField === field ? (
			<span className={styles.instantSettings__savedFlash} aria-live="polite">
				{t('Saved')} ✓
			</span>
		) : null;

	return (
		<section className={styles.instantSettings} data-cy="instant-settings">
			<header className={styles.instantSettings__header}>
				<Zap size={20} />
				<h2 className={styles.instantSettings__title}>{t('Instant Settings')}</h2>
				<p className={styles.instantSettings__caption}>
					{t('The settings you change most — saved the moment you tap')}
				</p>
			</header>

			{isQuestion && (
				<div className={styles.instantSettings__field}>
					<div className={styles.instantSettings__fieldLabelRow}>
						<h3 className={styles.instantSettings__fieldLabel}>
							{t('How do participants respond?')}
						</h3>
						{savedPill('mode')}
					</div>
					<p className={styles.instantSettings__helper}>
						{t('This changes the main screen everyone sees')}
					</p>
					<MultiSwitch
						options={[
							{
								label: t('Rate ideas'),
								value: EvaluationUI.suggestions,
								icon: <SuggestionsIcon />,
								toolTip: t('Everyone scores each suggestion'),
							},
							{
								label: t('Vote for one'),
								value: EvaluationUI.voting,
								icon: <VotingIcon />,
								toolTip: t('Each person picks a single option'),
							},
							{
								label: t('Approve'),
								value: EvaluationUI.checkbox,
								icon: <ConsentIcon />,
								toolTip: t('Check every option you accept'),
							},
							{
								label: t('Group similar'),
								value: EvaluationUI.clustering,
								icon: <ClusterIcon />,
								toolTip: t('Sort ideas into clusters together'),
							},
						]}
						onClick={handleModeChange}
						currentValue={mode}
					/>
					{isVoting && <VotingSettings />}
				</div>
			)}

			{isQuestion &&
				(showRatingScale ? (
					<div className={styles.instantSettings__field}>
						<div className={styles.instantSettings__fieldLabelRow}>
							<h3 className={styles.instantSettings__fieldLabel}>{t('Rating scale')}</h3>
							{savedPill('scale')}
						</div>
						<p className={styles.instantSettings__helper}>
							{t('What each participant taps on a suggestion')}
						</p>
						<RatingScaleButtons
							options={[
								{
									label: t('Agree - Disagree'),
									value: evaluationType.range,
									icon: <SuggestionsIcon />,
									toolTip: t('5 faces, from strongly against to strongly for (-1 to +1)'),
									score: 0,
								},
								{
									label: t('Thumbs up or down'),
									value: evaluationType.likeDislike,
									icon: <EvaluationsIcon />,
									toolTip: t('Simple +1 or -1'),
									score: 1,
								},
								{
									label: t('Likes only'),
									value: evaluationType.singleLike,
									icon: <LikeIcon />,
									toolTip: t('Positive-only, 0 or 1 — no downvotes'),
									score: 2,
								},
								{
									label: t('Community Voice'),
									value: evaluationType.communityVoice,
									icon: <UsersIcon />,
									toolTip: t('Respectful 4-level resonance scale'),
									score: 3,
								},
							]}
							onClick={handleScaleChange}
							currentValue={currentScale}
						/>
						{currentScale === evaluationType.range && (
							<div className={toggleWrapClass}>
								<ToggleSwitch
									isChecked={settings.ratingMode === 'reactions'}
									onChange={(checked) => {
										handleSettingChange('ratingMode', checked ? 'reactions' : 'agree-disagree');
										flashSaved('ratingMode');
									}}
									label={t('Use emoji reactions')}
									description={t('Show playful emoji instead of agree/disagree faces')}
									icon={Heart}
								/>
							</div>
						)}
						{savedPill('ratingMode')}
					</div>
				) : (
					<p className={styles.instantSettings__helper}>
						{t('Rating scale is set automatically for this mode')}
					</p>
				))}

			<div className={`${styles.instantSettings__toggles} ${toggleWrapClass}`}>
				<ToggleSwitch
					isChecked={settings.enableEvaluation ?? true}
					onChange={(checked) => toggle('enableEvaluation', checked)}
					label={t('Accepting responses')}
					description={t('Off = participants can see but not rate or vote')}
					icon={Vote}
				/>
				{savedPill('enableEvaluation')}
				<ToggleSwitch
					isChecked={settings.hasChat ?? false}
					onChange={(checked) => toggle('hasChat', checked)}
					label={t('Discussion chat')}
					description={t('Let participants talk in a chat alongside the question')}
					icon={MessageCircle}
				/>
				{savedPill('hasChat')}
				<ToggleSwitch
					isChecked={settings.showEvaluation ?? false}
					onChange={(checked) => toggle('showEvaluation', checked)}
					label={t('Show live results')}
					description={t('Participants see scores while responding (may bias them)')}
					icon={PieChart}
				/>
				{savedPill('showEvaluation')}
			</div>
		</section>
	);
};

export default InstantSettings;
