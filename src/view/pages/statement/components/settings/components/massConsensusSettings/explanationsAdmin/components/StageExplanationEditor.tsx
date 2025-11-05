import React, { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { ExplanationConfig, PostActionConfig, ExplanationDisplayMode } from 'delib-npm';
import styles from './StageExplanationEditor.module.scss';

interface StageInfo {
  id: string;
  label: string;
  icon: string;
}

interface StageConfiguration {
  id: string;
  enabled: boolean;
  beforeStage?: ExplanationConfig;
  afterAction?: PostActionConfig;
}

interface GlobalSettings {
  enabled: boolean;
  defaultDisplayMode: ExplanationDisplayMode;
  showProgressIndicator: boolean;
  allowUserDismiss: boolean;
}

interface StageExplanationEditorProps {
  stageId: string;
  stageInfo: StageInfo;
  config: StageConfiguration;
  globalSettings: GlobalSettings;
  language: string;
  onChange: (updates: Partial<StageConfiguration>) => void;
}

const DISPLAY_MODE_OPTIONS: ExplanationDisplayMode[] = ['card', 'inline', 'tooltip', 'modal', 'toast', 'banner'];

const StageExplanationEditor: FC<StageExplanationEditorProps> = ({
  stageId,
  stageInfo,
  config,
  globalSettings,
  language,
  onChange
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');
  const [showVariables, setShowVariables] = useState(false);
  const [textStats, setTextStats] = useState({ chars: 0, words: 0 });

  // Calculate text statistics
  const updateTextStats = (text: string) => {
    const chars = text.length;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    setTextStats({ chars, words });
  };

  // Handle text content change
  const handleContentChange = (content: string) => {
    updateTextStats(content);

    if (activeTab === 'before') {
      onChange({
        beforeStage: {
          ...config.beforeStage,
          content
        }
      });
    } else {
      onChange({
        afterAction: {
          ...config.afterAction,
          successMessage: content
        }
      });
    }
  };

  // Insert variable at cursor position
  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('content-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = config.beforeStage?.content || '';

    const newContent = currentContent.substring(0, start) + variable + currentContent.substring(end);
    handleContentChange(newContent);

    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  return (
    <div className={styles.editorContainer}>
      {/* Stage Header */}
      <div className={styles.editorHeader}>
        <div className={styles.stageInfo}>
          <span className={styles.stageIcon}>{stageInfo.icon}</span>
          <div className={styles.stageDetails}>
            <h2 className={styles.stageName}>{t(stageInfo.label)}</h2>
            <p className={styles.stageId}>Stage ID: {stageId}</p>
          </div>
        </div>

        {/* Enable/Disable toggle */}
        <label className={styles.stageToggle}>
          <span>{t('Enable stage explanations')}</span>
          <div className={styles.switchWrapper}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className={styles.switch}
            />
            <span className={styles.switchSlider}></span>
          </div>
        </label>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabNav}>
        <button
          className={`${styles.tab} ${activeTab === 'before' ? styles.active : ''}`}
          onClick={() => setActiveTab('before')}
        >
          <span className={styles.tabIcon}>📖</span>
          {t('Pre-Stage Explanation')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'after' ? styles.active : ''}`}
          onClick={() => setActiveTab('after')}
        >
          <span className={styles.tabIcon}>💬</span>
          {t('Post-Action Feedback')}
        </button>
      </div>

      {/* Editor Content */}
      <div className={`${styles.editorContent} ${!config.enabled ? styles.disabled : ''}`}>
        {activeTab === 'before' ? (
          <div className={styles.explanationEditor}>
            {/* Title Field */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                {t('Title')} <span className={styles.optional}>({t('optional')})</span>
              </label>
              <input
                type="text"
                value={config.beforeStage?.title || ''}
                onChange={(e) => onChange({
                  beforeStage: {
                    ...config.beforeStage,
                    title: e.target.value
                  }
                })}
                placeholder={t('Enter a title for this explanation')}
                className={styles.textInput}
                disabled={!config.enabled}
              />
            </div>

            {/* Content Field */}
            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel}>
                  {t('Content')} <span className={styles.required}>*</span>
                </label>
                <button
                  className={styles.variablesButton}
                  onClick={() => setShowVariables(!showVariables)}
                  disabled={!config.enabled}
                >
                  {showVariables ? t('Hide Variables') : t('Show Variables')}
                </button>
              </div>

              {showVariables && (
                <div className={styles.variablesBar}>
                  <span className={styles.variablesLabel}>{t('Click to insert:')}</span>
                  {['{{participantCount}}', '{{votesNeeded}}', '{{timeRemaining}}', '{{currentStage}}', '{{totalStages}}'].map(variable => (
                    <button
                      key={variable}
                      className={styles.variableChip}
                      onClick={() => insertVariable(variable)}
                      disabled={!config.enabled}
                    >
                      {variable}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                id="content-editor"
                value={config.beforeStage?.content || ''}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder={t('Enter explanation text that will help users understand this stage...')}
                className={styles.textArea}
                rows={6}
                disabled={!config.enabled}
              />

              <div className={styles.textStats}>
                <span>{textStats.chars} {t('characters')}</span>
                <span className={styles.separator}>•</span>
                <span>{textStats.words} {t('words')}</span>
                <span className={styles.separator}>•</span>
                <span>{t('Language')}: {language}</span>
              </div>
            </div>

            {/* Display Settings */}
            <div className={styles.settingsRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('Display Mode')}</label>
                <select
                  value={config.beforeStage?.displayMode || globalSettings.defaultDisplayMode}
                  onChange={(e) => onChange({
                    beforeStage: {
                      ...config.beforeStage,
                      displayMode: e.target.value as ExplanationDisplayMode
                    }
                  })}
                  className={styles.select}
                  disabled={!config.enabled}
                >
                  <option value="">{t('Use default')} ({globalSettings.defaultDisplayMode})</option>
                  {DISPLAY_MODE_OPTIONS.map(mode => (
                    <option key={mode} value={mode}>{t(mode)}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('Display Duration')}</label>
                <div className={styles.durationInput}>
                  <input
                    type="number"
                    value={config.beforeStage?.displayDuration || 0}
                    onChange={(e) => onChange({
                      beforeStage: {
                        ...config.beforeStage,
                        displayDuration: parseInt(e.target.value) || 0
                      }
                    })}
                    min="0"
                    max="30000"
                    step="1000"
                    className={styles.numberInput}
                    disabled={!config.enabled}
                  />
                  <span className={styles.unit}>{t('ms')}</span>
                  <span className={styles.hint}>{t('0 = manual dismiss')}</span>
                </div>
              </div>
            </div>

            {/* Behavior Settings */}
            <div className={styles.behaviorSettings}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.beforeStage?.showOnlyFirstTime || false}
                  onChange={(e) => onChange({
                    beforeStage: {
                      ...config.beforeStage,
                      showOnlyFirstTime: e.target.checked
                    }
                  })}
                  disabled={!config.enabled}
                />
                <span>{t('Show only first time')}</span>
                <span className={styles.checkboxHint}>{t('Users will see this explanation only once')}</span>
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.beforeStage?.dismissible !== false}
                  onChange={(e) => onChange({
                    beforeStage: {
                      ...config.beforeStage,
                      dismissible: e.target.checked
                    }
                  })}
                  disabled={!config.enabled}
                />
                <span>{t('Allow dismissal')}</span>
                <span className={styles.checkboxHint}>{t('Users can close this explanation')}</span>
              </label>
            </div>
          </div>
        ) : (
          <div className={styles.feedbackEditor}>
            {/* Success Message */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                {t('Success Message')}
              </label>
              <textarea
                value={config.afterAction?.successMessage || ''}
                onChange={(e) => onChange({
                  afterAction: {
                    ...config.afterAction,
                    successMessage: e.target.value
                  }
                })}
                placeholder={t('Message shown after successful action')}
                className={styles.textArea}
                rows={3}
                disabled={!config.enabled}
              />
            </div>

            {/* Error Message */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                {t('Error Message')}
              </label>
              <textarea
                value={config.afterAction?.errorMessage || ''}
                onChange={(e) => onChange({
                  afterAction: {
                    ...config.afterAction,
                    errorMessage: e.target.value
                  }
                })}
                placeholder={t('Message shown when action fails')}
                className={styles.textArea}
                rows={3}
                disabled={!config.enabled}
              />
            </div>

            {/* Auto-advance Settings */}
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.afterAction?.autoAdvance?.enabled || false}
                  onChange={(e) => onChange({
                    afterAction: {
                      ...config.afterAction,
                      autoAdvance: { ...config.afterAction?.autoAdvance, enabled: e.target.checked }
                    }
                  })}
                  disabled={!config.enabled}
                />
                <span>{t('Auto-advance to next stage')}</span>
                <span className={styles.checkboxHint}>{t('Automatically proceed after action completes')}</span>
              </label>
            </div>

            {config.afterAction?.autoAdvance?.enabled && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('Auto-advance Delay')}</label>
                <div className={styles.durationInput}>
                  <input
                    type="number"
                    value={config.afterAction?.autoAdvance?.delay || 2000}
                    onChange={(e) => onChange({
                      afterAction: {
                        ...config.afterAction,
                        autoAdvance: { ...config.afterAction?.autoAdvance, delay: parseInt(e.target.value) || 0 }
                      }
                    })}
                    min="0"
                    max="10000"
                    step="500"
                    className={styles.numberInput}
                    disabled={!config.enabled}
                  />
                  <span className={styles.unit}>{t('ms')}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Preview Section */}
      <div className={styles.previewSection}>
        <div className={styles.previewHeader}>
          <span className={styles.previewTitle}>{t('Preview')}</span>
          <span className={styles.previewHint}>{t('This is how users will see it')}</span>
        </div>
        <div className={styles.previewContent}>
          {config.enabled ? (
            <div className={styles.previewMockup}>
              {activeTab === 'before' && config.beforeStage?.content ? (
                <div className={`${styles.mockupCard} ${styles[config.beforeStage?.displayMode || globalSettings.defaultDisplayMode]}`}>
                  {config.beforeStage?.title && (
                    <div className={styles.mockupTitle}>{config.beforeStage.title}</div>
                  )}
                  <div className={styles.mockupText}>
                    {config.beforeStage.content}
                  </div>
                  {config.beforeStage?.dismissible !== false && (
                    <button className={styles.mockupClose}>✕</button>
                  )}
                </div>
              ) : activeTab === 'after' && config.afterAction?.successMessage ? (
                <div className={styles.mockupToast}>
                  <span className={styles.toastIcon}>✓</span>
                  <span>{config.afterAction.successMessage}</span>
                </div>
              ) : (
                <div className={styles.noContent}>
                  {t('No content to preview')}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.noContent}>
              {t('Stage explanations are disabled')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StageExplanationEditor;