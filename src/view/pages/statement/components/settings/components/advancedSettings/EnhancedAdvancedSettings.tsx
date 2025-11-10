import { FC, useState, useEffect } from 'react';
import React from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { defaultStatementSettings } from '../../emptyStatementModel';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EnhancedAdvancedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementSettings, StatementType, evaluationType, Collections } from 'delib-npm';
import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { setMaxVotesPerUser } from '@/controllers/db/evaluation/setEvaluation';
import {
  Eye, EyeOff, MessageCircle, GitBranch, Users, UserPlus, Vote,
  ThumbsUp, BarChart3, CheckSquare, Send, Brain, Search,
  MessageSquare, Navigation, Plus, Info, Settings,
  Shield, Sparkles, ChevronDown, ChevronUp, HelpCircle,
  Zap, Database, Lightbulb, Award, Target, Layers,
  Activity, PieChart, TrendingUp, Lock, Unlock,
  FileText, Hash, Globe, UserCheck, AlertCircle
} from 'lucide-react';

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

  // Direct access to settings with defaults
  const settings: StatementSettings = statement.statementSettings ?? defaultStatementSettings;

  // Vote limit state
  const [isVoteLimitEnabled, setIsVoteLimitEnabled] = useState<boolean>(
    !!statement.evaluationSettings?.maxVotesPerUser
  );
  const [maxVotes, setMaxVotes] = useState<number>(
    statement.evaluationSettings?.maxVotesPerUser || 3
  );

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
  ];

  // Initialize expanded state based on category defaults
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    categories.reduce((acc, cat) => ({
      ...acc,
      [cat.id]: cat.defaultExpanded,
    }), {})
  );

  // Quick stats for the overview
  const activeSettingsCount = Object.values(settings).filter(v => v === true).length;
  const totalSettingsCount = Object.keys(settings).length;

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Update vote limit state when statement changes
  useEffect(() => {
    setIsVoteLimitEnabled(!!statement.evaluationSettings?.maxVotesPerUser);
    setMaxVotes(statement.evaluationSettings?.maxVotesPerUser || 3);
  }, [statement.statementId, statement.evaluationSettings?.maxVotesPerUser]);

  // Unified handler for all statement settings
  function handleSettingChange(
    property: keyof StatementSettings,
    newValue: boolean | string
  ) {
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

  // Toggle switch component
  const ToggleSwitch: FC<{
    isChecked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
    icon?: React.ElementType;
    badge?: 'recommended' | 'premium' | 'new';
  }> = ({ isChecked, onChange, label, description, icon: Icon, badge }) => (
    <div className={styles.toggleItem}>
      <div className={styles.toggleContent}>
        {Icon && (
          <div className={styles.toggleIcon}>
            <Icon size={18} />
          </div>
        )}
        <div className={styles.toggleInfo}>
          <div className={styles.toggleHeader}>
            <span className={styles.toggleLabel}>{label}</span>
            {badge && (
              <span className={`${styles.badge} ${styles[`badge--${badge}`]}`}>
                {t(badge)}
              </span>
            )}
          </div>
          {description && (
            <p className={styles.toggleDescription}>{description}</p>
          )}
        </div>
      </div>
      <label className={styles.toggleSwitch}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.toggleSlider}></span>
      </label>
    </div>
  );

  // Evaluation type card component
  const EvaluationCard: FC<{
    type: string;
    title: string;
    description: string;
    icon: React.ElementType;
    isSelected: boolean;
    onClick: () => void;
  }> = ({ type, title, description, icon: Icon, isSelected, onClick }) => (
    <button
      className={`${styles.evaluationCard} ${isSelected ? styles['evaluationCard--selected'] : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className={styles.evaluationCardIcon}>
        <Icon size={24} />
      </div>
      <h4 className={styles.evaluationCardTitle}>{title}</h4>
      <p className={styles.evaluationCardDescription}>{description}</p>
      {isSelected && (
        <div className={styles.evaluationCardCheck}>
          <CheckSquare size={20} />
        </div>
      )}
    </button>
  );

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
            <span>{activeSettingsCount} / {totalSettingsCount} {t('active')}</span>
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
            onClick={() => handleSettingChange('enableAIImprovement', !settings.enableAIImprovement)}
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
              className={`${styles.category} ${styles[`category--${category.priority}`]}`}
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
                    {category.priority === 'high' && t('Essential')}
                    {category.priority === 'medium' && t('Recommended')}
                    {category.priority === 'low' && t('Advanced')}
                  </span>
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {isExpanded && (
                <div className={styles.categoryContent}>
                  {/* Visibility & Access */}
                  {category.id === 'visibility' && (
                    <>
                      <ToggleSwitch
                        isChecked={statement.hide ?? false}
                        onChange={handleHideChange}
                        label={t('Hide this statement')}
                        description={t('Make this statement invisible to non-members')}
                        icon={EyeOff}
                      />
                      <ToggleSwitch
                        isChecked={settings.hasChat ?? false}
                        onChange={(checked) => handleSettingChange('hasChat', checked)}
                        label={t('Enable Chat')}
                        description={t('Allow members to chat and discuss')}
                        icon={MessageCircle}
                        badge="recommended"
                      />
                      <ToggleSwitch
                        isChecked={settings.hasChildren ?? false}
                        onChange={(checked) => handleSettingChange('hasChildren', checked)}
                        label={t('Enable Sub-Conversations')}
                        description={t('Allow nested discussions and sub-topics')}
                        icon={GitBranch}
                      />
                    </>
                  )}

                  {/* Participation & Collaboration */}
                  {category.id === 'participation' && (
                    <>
                      {statement.statementType === StatementType.question && (
                        <ToggleSwitch
                          isChecked={settings.joiningEnabled ?? false}
                          onChange={(checked) => handleSettingChange('joiningEnabled', checked)}
                          label={t('Enable Joining Options')}
                          description={t('Allow users to join and support specific options')}
                          icon={UserPlus}
                        />
                      )}
                      <ToggleSwitch
                        isChecked={settings.enableAddVotingOption ?? false}
                        onChange={(checked) => handleSettingChange('enableAddVotingOption', checked)}
                        label={t('Add Options in Voting')}
                        description={t('Participants can contribute new options while voting')}
                        icon={Plus}
                        badge="recommended"
                      />
                      <ToggleSwitch
                        isChecked={settings.enableAddEvaluationOption ?? false}
                        onChange={(checked) => handleSettingChange('enableAddEvaluationOption', checked)}
                        label={t('Add Options in Evaluation')}
                        description={t('Participants can add options during evaluation')}
                        icon={Plus}
                      />
                    </>
                  )}

                  {/* Evaluation & Voting */}
                  {category.id === 'evaluation' && (
                    <>
                      <div className={styles.evaluationTypeSection}>
                        <h4 className={styles.sectionTitle}>
                          <Target size={18} />
                          {t('Evaluation Method')}
                        </h4>
                        <div className={styles.evaluationCards}>
                          <EvaluationCard
                            type={evaluationType.range}
                            title={t('Range Voting')}
                            description={t('Rate options on a scale')}
                            icon={BarChart3}
                            isSelected={(settings.evaluationType ?? evaluationType.range) === evaluationType.range}
                            onClick={() => handleSettingChange('evaluationType', evaluationType.range)}
                          />
                          <EvaluationCard
                            type={evaluationType.singleLike}
                            title={t('Single Choice')}
                            description={t('Vote for preferred options')}
                            icon={ThumbsUp}
                            isSelected={(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike}
                            onClick={() => handleSettingChange('evaluationType', evaluationType.singleLike)}
                          />
                          <EvaluationCard
                            type={evaluationType.preference}
                            title={t('Preference Order')}
                            description={t('Rank options by preference')}
                            icon={TrendingUp}
                            isSelected={(settings.evaluationType ?? evaluationType.range) === evaluationType.preference}
                            onClick={() => handleSettingChange('evaluationType', evaluationType.preference)}
                          />
                        </div>
                      </div>

                      {/* Vote Limiting */}
                      {(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike && (
                        <div className={styles.voteLimitSection}>
                          <ToggleSwitch
                            isChecked={isVoteLimitEnabled}
                            onChange={handleVoteLimitToggle}
                            label={t('Limit votes per user')}
                            description={t('Restrict the number of options users can vote for')}
                            icon={Lock}
                          />
                          {isVoteLimitEnabled && (
                            <div className={styles.voteLimitConfig}>
                              <label className={styles.inputGroup}>
                                <span>{t('Maximum votes')}</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={maxVotes}
                                  onChange={handleMaxVotesChange}
                                  className={styles.numberInput}
                                />
                                <span className={styles.helperText}>
                                  {t('Users can vote for up to {{count}} options', { count: maxVotes })}
                                </span>
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      <ToggleSwitch
                        isChecked={settings.showEvaluation ?? false}
                        onChange={(checked) => handleSettingChange('showEvaluation', checked)}
                        label={t('Show Results')}
                        description={t('Display evaluation results to participants')}
                        icon={PieChart}
                      />
                      <ToggleSwitch
                        isChecked={settings.enableEvaluation ?? true}
                        onChange={(checked) => handleSettingChange('enableEvaluation', checked)}
                        label={t('Enable Voting')}
                        description={t('Allow users to vote and evaluate options')}
                        icon={Vote}
                        badge="recommended"
                      />
                      <ToggleSwitch
                        isChecked={settings.inVotingGetOnlyResults ?? false}
                        onChange={(checked) => handleSettingChange('inVotingGetOnlyResults', checked)}
                        label={t('Show Top Results Only')}
                        description={t('Display only highest-rated options in voting view')}
                        icon={Award}
                      />
                      <ToggleSwitch
                        isChecked={settings.isSubmitMode ?? false}
                        onChange={(checked) => handleSettingChange('isSubmitMode', checked)}
                        label={t('Submit Mode')}
                        description={t('Users submit final choices rather than continuous voting')}
                        icon={Send}
                      />
                    </>
                  )}

                  {/* AI & Automation */}
                  {category.id === 'ai' && (
                    <>
                      <ToggleSwitch
                        isChecked={settings.enableAIImprovement ?? false}
                        onChange={(checked) => handleSettingChange('enableAIImprovement', checked)}
                        label={t('AI Suggestion Enhancement')}
                        description={t('Use AI to improve and refine user suggestions')}
                        icon={Sparkles}
                        badge="premium"
                      />
                      <ToggleSwitch
                        isChecked={settings.enableSimilaritiesSearch ?? false}
                        onChange={(checked) => handleSettingChange('enableSimilaritiesSearch', checked)}
                        label={t('Similarity Detection')}
                        description={t('Automatically detect and group similar suggestions')}
                        icon={Search}
                      />
                      {statement.statementType === StatementType.question && (
                        <ToggleSwitch
                          isChecked={settings.defaultLookForSimilarities ?? false}
                          onChange={(checked) => handleSettingChange('defaultLookForSimilarities', checked)}
                          label={t('Auto-Check Similarities')}
                          description={t('Check for similar statements by default')}
                          icon={Database}
                        />
                      )}
                    </>
                  )}

                  {/* Discussion Framework */}
                  {category.id === 'discussion' && statement.statementType === StatementType.question && (
                    <>
                      <ToggleSwitch
                        isChecked={settings.popperianDiscussionEnabled ?? false}
                        onChange={(checked) => handleSettingChange('popperianDiscussionEnabled', checked)}
                        label={t('Popper-Hebbian Mode')}
                        description={t('Evidence-based discussion with support/challenge format')}
                        icon={Lightbulb}
                        badge="new"
                      />
                      {settings.popperianDiscussionEnabled && (
                        <ToggleSwitch
                          isChecked={settings.popperianPreCheckEnabled ?? false}
                          onChange={(checked) => handleSettingChange('popperianPreCheckEnabled', checked)}
                          label={t('AI Pre-Check')}
                          description={t('AI reviews and refines options before posting')}
                          icon={Shield}
                        />
                      )}
                    </>
                  )}

                  {/* Navigation & Structure */}
                  {category.id === 'navigation' && (
                    <>
                      {statement.statementType === StatementType.question && (
                        <ToggleSwitch
                          isChecked={settings.enableAddNewSubQuestionsButton ?? false}
                          onChange={(checked) => handleSettingChange('enableAddNewSubQuestionsButton', checked)}
                          label={t('Sub-Questions Button')}
                          description={t('Show button to create nested questions')}
                          icon={Plus}
                        />
                      )}
                      <ToggleSwitch
                        isChecked={settings.enableNavigationalElements ?? false}
                        onChange={(checked) => handleSettingChange('enableNavigationalElements', checked)}
                        label={t('Navigation Elements')}
                        description={t('Display breadcrumbs and navigation aids')}
                        icon={Navigation}
                      />
                    </>
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