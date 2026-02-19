import { FC, useState } from 'react';
import React from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { defaultStatementSettings } from '../../emptyStatementModel';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EnhancedAdvancedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementSettings, Collections } from '@freedi/shared-types';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import {
	Eye,
	EyeOff,
	MessageCircle,
	Users,
	Vote,
	Brain,
	MessageSquare,
	Navigation,
	Settings,
	ChevronDown,
	ChevronUp,
	HelpCircle,
	Zap,
	Activity,
	Globe,
	Download,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { createStatementsByParentSelector } from '@/redux/utils/selectorFactories';
import type { RootState } from '@/redux/store';

// Sub-components
import VisibilitySettings from './VisibilitySettings';
import ParticipationSettings from './ParticipationSettings';
import EvaluationSettings from './EvaluationSettings';
import AISettings from './AISettings';
import DiscussionSettings from './DiscussionSettings';
import NavigationSettings from './NavigationSettings';
import LocalizationSettings from './LocalizationSettings';
import ExportSettings from './ExportSettings';

interface CategoryConfig {
	id: string;
	title: string;
	icon: React.ElementType;
	description: string;
	priority: 'high' | 'medium' | 'low';
	defaultExpanded: boolean;
}

const EnhancedAdvancedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();

	const settings: StatementSettings = statement.statementSettings ?? defaultStatementSettings;

	// Selector for sub-statements
	const selectSubStatements = createStatementsByParentSelector(
		(state: RootState) => state.statements.statements,
	);
	const subStatements = useSelector(selectSubStatements(statement.statementId));

	// Category configurations
	const categories: CategoryConfig[] = [
		{
			id: 'visibility',
			title: t('Visibility & Access'),
			icon: Eye,
			description: t('Control who can see and access this statement'),
			priority: 'high',
			defaultExpanded: true,
		},
		{
			id: 'participation',
			title: t('Participation & Collaboration'),
			icon: Users,
			description: t('Define how users can contribute and interact'),
			priority: 'high',
			defaultExpanded: true,
		},
		{
			id: 'evaluation',
			title: t('Evaluation & Voting'),
			icon: Vote,
			description: t('Configure voting and evaluation mechanisms'),
			priority: 'medium',
			defaultExpanded: true,
		},
		{
			id: 'ai',
			title: t('AI & Automation'),
			icon: Brain,
			description: t('Enable intelligent features and automation'),
			priority: 'medium',
			defaultExpanded: false,
		},
		{
			id: 'discussion',
			title: t('Discussion Framework'),
			icon: MessageSquare,
			description: t('Set up discussion modes and frameworks'),
			priority: 'low',
			defaultExpanded: false,
		},
		{
			id: 'navigation',
			title: t('Navigation & Structure'),
			icon: Navigation,
			description: t('Organize content structure and navigation'),
			priority: 'low',
			defaultExpanded: false,
		},
		{
			id: 'localization',
			title: t('Localization'),
			icon: Globe,
			description: t('Set default language for surveys'),
			priority: 'medium',
			defaultExpanded: true,
		},
		{
			id: 'dataExport',
			title: t('Data Export'),
			icon: Download,
			description: t('Export statement data in various formats'),
			priority: 'low',
			defaultExpanded: false,
		},
	];

	// Initialize expanded state based on category defaults
	const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
		categories.reduce(
			(acc, cat) => ({
				...acc,
				[cat.id]: cat.defaultExpanded,
			}),
			{},
		),
	);

	// Quick stats for the overview
	const activeSettingsCount = Object.values(settings).filter((v) => v === true).length;
	const totalSettingsCount = Object.keys(settings).length;

	const toggleCategory = (categoryId: string) => {
		setExpandedCategories((prev) => ({
			...prev,
			[categoryId]: !prev[categoryId],
		}));
	};

	// Unified handler for all statement settings
	function handleSettingChange(
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) {
		setStatementSettingToDB({
			statement,
			property,
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	function handleHideChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { hide: newValue }, { merge: true });
	}

	function handleIsDocumentChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { isDocument: newValue, lastUpdate: Date.now() }, { merge: true });
	}

	function handleDefaultLanguageChange(newLanguage: string) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { defaultLanguage: newLanguage, lastUpdate: Date.now() }, { merge: true });
	}

	function handleForceLanguageChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { forceLanguage: newValue, lastUpdate: Date.now() }, { merge: true });
	}

	function handlePowerFollowMeChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		const powerFollowMePath = newValue ? `/statement/${statement.statementId}/chat` : '';
		updateDoc(statementRef, { powerFollowMe: powerFollowMePath, lastUpdate: Date.now() });
	}

	return (
		<div className={styles.enhancedSettings}>
			{/* Header with Overview */}
			<div className={styles.header}>
				<div className={styles.headerContent}>
					<h2 className={styles.title}>
						<Settings size={24} />
						{t('Statement Settings')}
					</h2>
					<p className={styles.subtitle}>
						{t('Configure how your statement works and who can interact with it')}
					</p>
				</div>

				{/* Quick Stats */}
				<div className={styles.quickStats}>
					<div className={styles.statItem}>
						<Activity size={16} />
						<span>
							{activeSettingsCount} / {totalSettingsCount} {t('active')}
						</span>
					</div>
					<div className={styles.statItem}>
						{statement.hide ? <EyeOff size={16} /> : <Eye size={16} />}
						<span>{statement.hide ? t('Hidden') : t('Visible')}</span>
					</div>
					<div className={styles.statItem}>
						<Users size={16} />
						<span>{settings.enableEvaluation ? t('Voting On') : t('Voting Off')}</span>
					</div>
				</div>
			</div>

			{/* Quick Actions Bar */}
			<div className={styles.quickActions}>
				<h3 className={styles.quickActionsTitle}>
					<Zap size={18} />
					{t('Quick Actions')}
				</h3>
				<div className={styles.quickActionButtons}>
					<button
						className={`${styles.quickAction} ${statement.hide ? styles['quickAction--active'] : ''}`}
						onClick={() => handleHideChange(!statement.hide)}
						title={t('Toggle visibility')}
					>
						{statement.hide ? <EyeOff size={18} /> : <Eye size={18} />}
						<span>{statement.hide ? t('Show') : t('Hide')}</span>
					</button>
					<button
						className={`${styles.quickAction} ${settings.hasChat ? styles['quickAction--active'] : ''}`}
						onClick={() => handleSettingChange('hasChat', !settings.hasChat)}
						title={t('Toggle chat')}
					>
						<MessageCircle size={18} />
						<span>{t('Chat')}</span>
					</button>
					<button
						className={`${styles.quickAction} ${settings.enableEvaluation ? styles['quickAction--active'] : ''}`}
						onClick={() => handleSettingChange('enableEvaluation', !settings.enableEvaluation)}
						title={t('Toggle voting')}
					>
						<Vote size={18} />
						<span>{t('Voting')}</span>
					</button>
					<button
						className={`${styles.quickAction} ${settings.enableAIImprovement ? styles['quickAction--active'] : ''}`}
						onClick={() =>
							handleSettingChange('enableAIImprovement', !settings.enableAIImprovement)
						}
						title={t('Toggle AI')}
					>
						<Brain size={18} />
						<span>{t('AI')}</span>
					</button>
				</div>
			</div>

			{/* Categories */}
			<div className={styles.categories}>
				{categories.map((category) => {
					const CategoryIcon = category.icon;
					const isExpanded = expandedCategories[category.id];

					return (
						<div
							key={category.id}
							className={`${styles.category} ${category.id === 'teamFormation' ? styles['category--teamFormation'] : styles[`category--${category.priority}`]}`}
						>
							<button
								className={styles.categoryHeader}
								onClick={() => toggleCategory(category.id)}
								type="button"
							>
								<div className={styles.categoryHeaderLeft}>
									<CategoryIcon size={20} />
									<div>
										<h3 className={styles.categoryTitle}>{category.title}</h3>
										<p className={styles.categoryDescription}>{category.description}</p>
									</div>
								</div>
								<div className={styles.categoryHeaderRight}>
									<span className={styles.categoryBadge}>
										{category.id === 'teamFormation' && t('Teams')}
										{category.id !== 'teamFormation' &&
											category.priority === 'high' &&
											t('Essential')}
										{category.priority === 'medium' && t('Recommended')}
										{category.priority === 'low' && t('Advanced')}
									</span>
									{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
								</div>
							</button>

							{isExpanded && (
								<div className={styles.categoryContent}>
									{category.id === 'visibility' && (
										<VisibilitySettings
											statement={statement}
											settings={settings}
											handleHideChange={handleHideChange}
											handleSettingChange={handleSettingChange}
											handlePowerFollowMeChange={handlePowerFollowMeChange}
											handleIsDocumentChange={handleIsDocumentChange}
										/>
									)}

									{category.id === 'participation' && (
										<ParticipationSettings
											statement={statement}
											settings={settings}
											handleSettingChange={handleSettingChange}
										/>
									)}

									{category.id === 'evaluation' && (
										<EvaluationSettings
											statement={statement}
											settings={settings}
											handleSettingChange={handleSettingChange}
										/>
									)}

									{category.id === 'ai' && (
										<AISettings
											statement={statement}
											settings={settings}
											handleSettingChange={handleSettingChange}
										/>
									)}

									{category.id === 'discussion' && (
										<DiscussionSettings
											statement={statement}
											settings={settings}
											handleSettingChange={handleSettingChange}
										/>
									)}

									{category.id === 'navigation' && (
										<NavigationSettings
											statement={statement}
											settings={settings}
											handleSettingChange={handleSettingChange}
										/>
									)}

									{category.id === 'localization' && (
										<LocalizationSettings
											statement={statement}
											handleDefaultLanguageChange={handleDefaultLanguageChange}
											handleForceLanguageChange={handleForceLanguageChange}
										/>
									)}

									{category.id === 'dataExport' && (
										<ExportSettings statement={statement} subStatements={subStatements} />
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Help Section */}
			<div className={styles.helpSection}>
				<HelpCircle size={18} />
				<span>{t('Need help?')}</span>
				<a href="#" className={styles.helpLink}>
					{t('View documentation')}
				</a>
			</div>
		</div>
	);
};

export default EnhancedAdvancedSettings;
