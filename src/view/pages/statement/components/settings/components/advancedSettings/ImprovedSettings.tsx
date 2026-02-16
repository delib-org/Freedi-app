import { FC, useState, useEffect } from 'react';
import React from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { defaultStatementSettings } from '../../emptyStatementModel';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './ImprovedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import {
	StatementSettings,
	StatementType,
	evaluationType,
	Collections,
} from '@freedi/shared-types';
import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { setMaxVotesPerUser } from '@/controllers/db/evaluation/setEvaluation';
import clsx from 'clsx';

// Lucide React Icons
import {
	Eye,
	EyeOff,
	MessageSquare,
	GitBranch,
	Users,
	UserPlus,
	Vote,
	ListPlus,
	BarChart3,
	ChartBar,
	ThumbsUp,
	Target,
	Sliders,
	Brain,
	Search,
	HelpCircle,
	FlaskConical,
	BrainCircuit,
	Compass,
	PlusCircle,
	Settings,
	Shield,
	Zap,
	Check,
	X,
	ChevronDown,
	ChevronRight,
	Sparkles,
	FileCheck,
	AlertCircle,
	TrendingUp,
	Activity,
} from 'lucide-react';

// Enhanced Toggle Component
interface ToggleProps {
	isChecked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description?: string;
	icon?: React.ReactNode;
	disabled?: boolean;
	badge?: string;
}

const Toggle: FC<ToggleProps> = ({
	isChecked,
	onChange,
	label,
	description,
	icon,
	disabled = false,
	badge,
}) => {
	const handleToggle = () => {
		if (!disabled) {
			onChange(!isChecked);
		}
	};

	return (
		<div className={clsx(styles.toggleItem, disabled && styles.disabled)}>
			<div className={styles.toggleContent} onClick={handleToggle}>
				{icon && <div className={styles.toggleIcon}>{icon}</div>}
				<div className={styles.toggleText}>
					<div className={styles.toggleLabel}>
						{label}
						{badge && <span className={styles.badge}>{badge}</span>}
					</div>
					{description && <div className={styles.toggleDescription}>{description}</div>}
				</div>
			</div>
			<button
				type="button"
				className={clsx(styles.toggle, isChecked && styles.checked)}
				onClick={handleToggle}
				disabled={disabled}
				aria-label={`Toggle ${label}`}
			>
				<span className={styles.toggleSlider} />
			</button>
		</div>
	);
};

// Evaluation Type Card Component
interface EvaluationCardProps {
	type: evaluationType;
	title: string;
	description: string;
	icon: React.ReactNode;
	isSelected: boolean;
	onClick: () => void;
	recommended?: boolean;
}

const EvaluationCard: FC<EvaluationCardProps> = ({
	type: _type,
	title,
	description,
	icon,
	isSelected,
	onClick,
	recommended,
}) => {
	return (
		<button
			type="button"
			className={clsx(
				styles.evaluationCard,
				isSelected && styles.selected,
				recommended && styles.recommended,
			)}
			onClick={onClick}
		>
			{recommended && <span className={styles.recommendedBadge}>Recommended</span>}
			<div className={styles.evaluationIcon}>{icon}</div>
			<div className={styles.evaluationTitle}>{title}</div>
			<div className={styles.evaluationDescription}>{description}</div>
			{isSelected && (
				<div className={styles.selectedIndicator}>
					<Check size={16} />
				</div>
			)}
		</button>
	);
};

// Category Section Component
interface CategoryProps {
	title: string;
	icon: React.ReactNode;
	description?: string;
	children: React.ReactNode;
	isExpanded?: boolean;
	onToggle?: () => void;
	badge?: string;
	importance?: 'high' | 'medium' | 'low';
}

const CategorySection: FC<CategoryProps> = ({
	title,
	icon,
	description,
	children,
	isExpanded = true,
	onToggle,
	badge,
	importance = 'medium',
}) => {
	return (
		<div className={clsx(styles.category, styles[`importance-${importance}`])}>
			<button
				type="button"
				className={styles.categoryHeader}
				onClick={onToggle}
				aria-expanded={isExpanded}
			>
				<div className={styles.categoryHeaderContent}>
					<div className={styles.categoryIcon}>{icon}</div>
					<div className={styles.categoryInfo}>
						<div className={styles.categoryTitle}>
							{title}
							{badge && <span className={styles.categoryBadge}>{badge}</span>}
						</div>
						{description && <div className={styles.categoryDescription}>{description}</div>}
					</div>
				</div>
				{onToggle && (
					<div className={styles.categoryToggle}>
						{isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
					</div>
				)}
			</button>
			{isExpanded && <div className={styles.categoryContent}>{children}</div>}
		</div>
	);
};

const ImprovedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();

	// Settings state
	const settings: StatementSettings = statement.statementSettings ?? defaultStatementSettings;

	// Category expansion state
	const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
		essential: true,
		participation: true,
		evaluation: false,
		ai: false,
		framework: false,
		advanced: false,
	});

	// Vote limit state
	const [isVoteLimitEnabled, setIsVoteLimitEnabled] = useState<boolean>(
		!!statement.evaluationSettings?.maxVotesPerUser,
	);
	const [maxVotes, setMaxVotes] = useState<number>(
		statement.evaluationSettings?.maxVotesPerUser || 3,
	);

	// Quick settings state (most commonly used)
	const [showQuickSettings, setShowQuickSettings] = useState(true);

	// Update vote limit state when statement changes
	useEffect(() => {
		setIsVoteLimitEnabled(!!statement.evaluationSettings?.maxVotesPerUser);
		setMaxVotes(statement.evaluationSettings?.maxVotesPerUser || 3);
	}, [statement.statementId, statement.evaluationSettings?.maxVotesPerUser]);

	// Toggle category expansion
	const toggleCategory = (category: string) => {
		setExpandedCategories((prev) => ({
			...prev,
			[category]: !prev[category],
		}));
	};

	// Unified handler for all statement settings
	function handleSettingChange(property: keyof StatementSettings, newValue: boolean | string) {
		setStatementSettingToDB({
			statement,
			property,
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	// Handler for hide toggle (root-level property)
	function handleHideChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { hide: newValue }, { merge: true });
	}

	function handleVoteLimitToggle(enabled: boolean) {
		setIsVoteLimitEnabled(enabled);
		if (enabled) {
			setMaxVotesPerUser(statement.statementId, maxVotes);
		} else {
			setMaxVotesPerUser(statement.statementId, undefined);
		}
	}

	function handleMaxVotesChange(e: React.ChangeEvent<HTMLInputElement>) {
		const value = Number(e.target.value);
		if (value >= 1 && value <= 100) {
			setMaxVotes(value);
			if (isVoteLimitEnabled) {
				setMaxVotesPerUser(statement.statementId, value);
			}
		}
	}

	const isQuestion = statement.statementType === StatementType.question;

	return (
		<div className={styles.improvedSettings}>
			{/* Header with Quick Actions */}
			<div className={styles.header}>
				<div className={styles.headerContent}>
					<Settings className={styles.headerIcon} size={24} />
					<div className={styles.headerText}>
						<h2 className={styles.title}>{t('Statement Settings')}</h2>
						<p className={styles.subtitle}>
							{t('Configure how participants interact with this statement')}
						</p>
					</div>
				</div>

				{/* Quick Toggle for Common Settings */}
				<div className={styles.quickActions}>
					<button
						type="button"
						className={clsx(styles.quickAction, statement.hide && styles.active)}
						onClick={() => handleHideChange(!statement.hide)}
						title={statement.hide ? t('Statement is hidden') : t('Statement is visible')}
					>
						{statement.hide ? <EyeOff size={18} /> : <Eye size={18} />}
						<span>{statement.hide ? t('Hidden') : t('Visible')}</span>
					</button>
					<button
						type="button"
						className={clsx(styles.quickAction, settings.hasChat && styles.active)}
						onClick={() => handleSettingChange('hasChat', !settings.hasChat)}
						title={t('Toggle chat')}
					>
						<MessageSquare size={18} />
						<span>{t('Chat')}</span>
					</button>
					<button
						type="button"
						className={clsx(styles.quickAction, settings.enableEvaluation && styles.active)}
						onClick={() => handleSettingChange('enableEvaluation', !settings.enableEvaluation)}
						title={t('Toggle voting')}
					>
						<Vote size={18} />
						<span>{t('Voting')}</span>
					</button>
				</div>
			</div>

			{/* Quick Settings Summary */}
			{showQuickSettings && (
				<div className={styles.quickSettings}>
					<div className={styles.quickSettingsHeader}>
						<Zap size={18} />
						<span>{t('Quick Overview')}</span>
						<button
							type="button"
							className={styles.closeQuick}
							onClick={() => setShowQuickSettings(false)}
						>
							<X size={16} />
						</button>
					</div>
					<div className={styles.quickSettingsGrid}>
						<div className={styles.quickStat}>
							<span className={styles.quickStatLabel}>{t('Visibility')}</span>
							<span className={styles.quickStatValue}>
								{statement.hide ? t('Hidden') : t('Public')}
							</span>
						</div>
						<div className={styles.quickStat}>
							<span className={styles.quickStatLabel}>{t('Evaluation')}</span>
							<span className={styles.quickStatValue}>
								{settings.evaluationType ?? evaluationType.range}
							</span>
						</div>
						<div className={styles.quickStat}>
							<span className={styles.quickStatLabel}>{t('Features')}</span>
							<span className={styles.quickStatValue}>
								{[
									settings.hasChat && t('Chat'),
									settings.hasChildren && t('Sub-items'),
									settings.enableAIImprovement && t('AI'),
								]
									.filter(Boolean)
									.join(', ') || t('Basic')}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Main Settings Categories */}
			<div className={styles.categories}>
				{/* Essential Settings - Always Visible */}
				<CategorySection
					title={t('Essential Settings')}
					icon={<Shield size={20} />}
					description={t('Core functionality and visibility controls')}
					isExpanded={expandedCategories.essential}
					onToggle={() => toggleCategory('essential')}
					importance="high"
				>
					<div className={styles.settingsGrid}>
						<Toggle
							isChecked={statement.hide ?? false}
							onChange={handleHideChange}
							label={t('Hide Statement')}
							description={t('Make this statement invisible to participants')}
							icon={<EyeOff size={18} />}
						/>
						<Toggle
							isChecked={settings.hasChat ?? false}
							onChange={(checked) => handleSettingChange('hasChat', checked)}
							label={t('Enable Chat')}
							description={t('Allow participants to discuss in real-time')}
							icon={<MessageSquare size={18} />}
						/>
						<Toggle
							isChecked={settings.hasChildren ?? false}
							onChange={(checked) => handleSettingChange('hasChildren', checked)}
							label={t('Allow Sub-Items')}
							description={t('Enable creating nested statements and discussions')}
							icon={<GitBranch size={18} />}
						/>
						<Toggle
							isChecked={settings.enableEvaluation ?? true}
							onChange={(checked) => handleSettingChange('enableEvaluation', checked)}
							label={t('Enable Voting')}
							description={t('Allow participants to vote and evaluate options')}
							icon={<Vote size={18} />}
							badge={t('Core')}
						/>
					</div>
				</CategorySection>

				{/* Participation Settings */}
				<CategorySection
					title={t('Participation & Collaboration')}
					icon={<Users size={20} />}
					description={t('Control how users can contribute and interact')}
					isExpanded={expandedCategories.participation}
					onToggle={() => toggleCategory('participation')}
					importance="high"
				>
					<div className={styles.settingsGrid}>
						{isQuestion && (
							<Toggle
								isChecked={settings.joiningEnabled ?? false}
								onChange={(checked) => handleSettingChange('joiningEnabled', checked)}
								label={t('Option Joining')}
								description={t('Users can join and support specific options')}
								icon={<UserPlus size={18} />}
							/>
						)}
						<Toggle
							isChecked={settings.enableAddVotingOption ?? false}
							onChange={(checked) => handleSettingChange('enableAddVotingOption', checked)}
							label={t('Add Options in Voting')}
							description={t('Users can suggest new options while voting')}
							icon={<ListPlus size={18} />}
						/>
						<Toggle
							isChecked={settings.enableAddEvaluationOption ?? false}
							onChange={(checked) => handleSettingChange('enableAddEvaluationOption', checked)}
							label={t('Add Options in Evaluation')}
							description={t('Users can suggest options during evaluation')}
							icon={<PlusCircle size={18} />}
						/>
					</div>
				</CategorySection>

				{/* Evaluation Settings */}
				<CategorySection
					title={t('Evaluation & Voting System')}
					icon={<BarChart3 size={20} />}
					description={t('Configure how voting and evaluation work')}
					isExpanded={expandedCategories.evaluation}
					onToggle={() => toggleCategory('evaluation')}
					badge={settings.evaluationType ?? evaluationType.range}
				>
					{/* Evaluation Type Selection */}
					<div className={styles.evaluationSection}>
						<h4 className={styles.sectionTitle}>
							<Target size={18} />
							{t('Evaluation Method')}
						</h4>
						<div className={styles.evaluationGrid}>
							<EvaluationCard
								type={evaluationType.range}
								title={t('Range Voting')}
								description={t('Rate options on a scale (e.g., 0-100)')}
								icon={<Sliders size={24} />}
								isSelected={
									(settings.evaluationType ?? evaluationType.range) === evaluationType.range
								}
								onClick={() => handleSettingChange('evaluationType', evaluationType.range)}
								recommended
							/>
							<EvaluationCard
								type={evaluationType.singleLike}
								title={t('Single Choice')}
								description={t('Like/vote for options individually')}
								icon={<ThumbsUp size={24} />}
								isSelected={
									(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike
								}
								onClick={() => handleSettingChange('evaluationType', evaluationType.singleLike)}
							/>
						</div>
					</div>

					{/* Vote Limiting for Single-Like */}
					{(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike && (
						<div className={styles.voteLimitSection}>
							<Toggle
								isChecked={isVoteLimitEnabled}
								onChange={handleVoteLimitToggle}
								label={t('Limit Votes Per User')}
								description={t('Restrict the number of options each user can vote for')}
								icon={<Shield size={18} />}
							/>
							{isVoteLimitEnabled && (
								<div className={styles.voteLimitControl}>
									<label htmlFor="maxVotes">{t('Maximum votes allowed')}</label>
									<div className={styles.numberInputWrapper}>
										<input
											id="maxVotes"
											type="number"
											min="1"
											max="100"
											value={maxVotes}
											onChange={handleMaxVotesChange}
											className={styles.numberInput}
										/>
										<span className={styles.numberInputHelp}>
											{t('Each user can vote for up to')} {maxVotes} {t('options')}
										</span>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Additional Evaluation Settings */}
					<div className={styles.settingsGrid}>
						<Toggle
							isChecked={settings.showEvaluation ?? false}
							onChange={(checked) => handleSettingChange('showEvaluation', checked)}
							label={t('Show Results')}
							description={t('Display voting results to participants')}
							icon={<ChartBar size={18} />}
						/>
						<Toggle
							isChecked={settings.inVotingGetOnlyResults ?? false}
							onChange={(checked) => handleSettingChange('inVotingGetOnlyResults', checked)}
							label={t('Top Results Only')}
							description={t('Show only the highest-rated options in voting view')}
							icon={<TrendingUp size={18} />}
						/>
						<Toggle
							isChecked={settings.isSubmitMode ?? false}
							onChange={(checked) => handleSettingChange('isSubmitMode', checked)}
							label={t('Submit Mode')}
							description={t('Require explicit submission of votes')}
							icon={<FileCheck size={18} />}
						/>
					</div>
				</CategorySection>

				{/* AI & Automation */}
				<CategorySection
					title={t('AI & Automation')}
					icon={<Brain size={20} />}
					description={t('Leverage AI to enhance discussions')}
					isExpanded={expandedCategories.ai}
					onToggle={() => toggleCategory('ai')}
					badge={settings.enableAIImprovement ? t('Active') : undefined}
				>
					<div className={styles.settingsGrid}>
						<Toggle
							isChecked={settings.enableAIImprovement ?? false}
							onChange={(checked) => handleSettingChange('enableAIImprovement', checked)}
							label={t('AI Suggestions')}
							description={t('AI helps improve and refine submitted options')}
							icon={<Sparkles size={18} />}
							badge={t('Premium')}
						/>
						<Toggle
							isChecked={settings.enableSimilaritiesSearch ?? false}
							onChange={(checked) => handleSettingChange('enableSimilaritiesSearch', checked)}
							label={t('Similarity Detection')}
							description={t('Find and group similar statements automatically')}
							icon={<Search size={18} />}
						/>
						{isQuestion && (
							<Toggle
								isChecked={settings.defaultLookForSimilarities ?? false}
								onChange={(checked) => handleSettingChange('defaultLookForSimilarities', checked)}
								label={t('Auto-Search Similar')}
								description={t('Automatically check for similar statements')}
								icon={<Activity size={18} />}
							/>
						)}
					</div>
				</CategorySection>

				{/* Discussion Framework - Only for Questions */}
				{isQuestion && (
					<CategorySection
						title={t('Discussion Framework')}
						icon={<FlaskConical size={20} />}
						description={t('Advanced discussion methodologies')}
						isExpanded={expandedCategories.framework}
						onToggle={() => toggleCategory('framework')}
						badge={settings.popperianDiscussionEnabled ? t('Popper-Hebbian') : undefined}
					>
						<div className={styles.frameworkSection}>
							<div className={styles.frameworkCard}>
								<div className={styles.frameworkHeader}>
									<BrainCircuit size={24} />
									<div className={styles.frameworkInfo}>
										<h4>{t('Popper-Hebbian Mode')}</h4>
										<p>{t('Evidence-based discussion with Support/Challenge format')}</p>
									</div>
								</div>
								<Toggle
									isChecked={settings.popperianDiscussionEnabled ?? false}
									onChange={(checked) => handleSettingChange('popperianDiscussionEnabled', checked)}
									label={t('Enable Popper-Hebbian')}
									description={t('Transform into structured debate with weighted evidence')}
									icon={<FlaskConical size={18} />}
								/>

								{settings.popperianDiscussionEnabled && (
									<div className={styles.subSettings}>
										<Toggle
											isChecked={settings.popperianPreCheckEnabled ?? false}
											onChange={(checked) =>
												handleSettingChange('popperianPreCheckEnabled', checked)
											}
											label={t('AI Pre-Check')}
											description={t('AI reviews and improves options before posting')}
											icon={<AlertCircle size={18} />}
											badge={t('Recommended')}
										/>
									</div>
								)}
							</div>
						</div>
					</CategorySection>
				)}

				{/* Advanced Settings */}
				<CategorySection
					title={t('Advanced Configuration')}
					icon={<Settings size={20} />}
					description={t('Additional navigation and structural options')}
					isExpanded={expandedCategories.advanced}
					onToggle={() => toggleCategory('advanced')}
					importance="low"
				>
					<div className={styles.settingsGrid}>
						{isQuestion && (
							<Toggle
								isChecked={settings.enableAddNewSubQuestionsButton ?? false}
								onChange={(checked) =>
									handleSettingChange('enableAddNewSubQuestionsButton', checked)
								}
								label={t('Sub-Questions Button')}
								description={t('Show button to create nested questions')}
								icon={<GitBranch size={18} />}
							/>
						)}
						<Toggle
							isChecked={settings.enableNavigationalElements ?? false}
							onChange={(checked) => handleSettingChange('enableNavigationalElements', checked)}
							label={t('Navigation Elements')}
							description={t('Show breadcrumbs and navigation aids')}
							icon={<Compass size={18} />}
						/>
					</div>
				</CategorySection>
			</div>

			{/* Help Section */}
			<div className={styles.helpSection}>
				<div className={styles.helpIcon}>
					<HelpCircle size={20} />
				</div>
				<div className={styles.helpContent}>
					<h4>{t('Need Help?')}</h4>
					<p>{t('Learn more about statement settings and best practices')}</p>
				</div>
				<button type="button" className={styles.helpButton}>
					{t('View Guide')}
				</button>
			</div>
		</div>
	);
};

export default ImprovedSettings;
