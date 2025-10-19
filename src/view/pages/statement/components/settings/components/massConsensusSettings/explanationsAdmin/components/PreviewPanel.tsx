import React, { FC } from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StageExplanation from '@/view/components/massConsensus/StageExplanation/StageExplanation';
import styles from './PreviewPanel.module.scss';

interface PreviewPanelProps {
  stageConfig: any;
  stageInfo: any;
  globalSettings: any;
}

const PreviewPanel: FC<PreviewPanelProps> = ({ stageConfig, stageInfo, globalSettings }) => {
  const { t, dir } = useUserConfig();

  if (!stageConfig || !stageInfo) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>👀</span>
          <h3>{t('No Stage Selected')}</h3>
          <p>{t('Select a stage from the sidebar to preview its explanations')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewPanel} dir={dir}>
      {/* Preview Header */}
      <div className={styles.previewHeader}>
        <div className={styles.headerInfo}>
          <span className={styles.previewBadge}>{t('Preview Mode')}</span>
          <h2 className={styles.stageName}>
            {stageInfo.icon} {t(stageInfo.label)}
          </h2>
          <p className={styles.stageDescription}>
            {t('This shows how users will see the explanations for this stage')}
          </p>
        </div>

        <div className={styles.deviceSelector}>
          <button className={`${styles.deviceOption} ${styles.active}`}>
            <span>💻</span>
            {t('Desktop')}
          </button>
          <button className={styles.deviceOption}>
            <span>📱</span>
            {t('Mobile')}
          </button>
          <button className={styles.deviceOption}>
            <span>📊</span>
            {t('Tablet')}
          </button>
        </div>
      </div>

      {/* Preview Container */}
      <div className={styles.previewContainer}>
        <div className={styles.browserMockup}>
          <div className={styles.browserBar}>
            <div className={styles.browserDots}>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className={styles.browserUrl}>
              freedi.app/statement/{stageInfo.id}
            </div>
          </div>

          <div className={styles.browserContent}>
            {/* Stage Content Mock */}
            <div className={styles.stageMockup}>
              <div className={styles.stageContentHeader}>
                <h3>{t('Mass Consensus Process')}</h3>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: '40%' }}></div>
                </div>
                <p className={styles.progressText}>
                  {t('Stage')} 2 {t('of')} 7
                </p>
              </div>

              {/* Display the actual explanation component */}
              {stageConfig.enabled && stageConfig.beforeStage?.content && (
                <div className={styles.explanationContainer}>
                  <StageExplanation
                    stageId={stageConfig.id}
                    explanation={{
                      ...stageConfig.beforeStage,
                      enabled: true,
                      displayMode: stageConfig.beforeStage.displayMode || globalSettings.defaultDisplayMode
                    }}
                  />
                </div>
              )}

              {/* Mock stage content */}
              <div className={styles.stageMainContent}>
                {stageInfo.id === 'question' && (
                  <div className={styles.questionMock}>
                    <h2>{t('What should we do about climate change?')}</h2>
                    <textarea
                      placeholder={t('Share your thoughts...')}
                      className={styles.mockTextarea}
                      disabled
                    />
                    <button className={styles.mockButton}>{t('Submit Answer')}</button>
                  </div>
                )}

                {stageInfo.id === 'randomSuggestions' && (
                  <div className={styles.suggestionsMock}>
                    <div className={styles.suggestionCard}>
                      <p>{t('Example suggestion 1')}</p>
                      <div className={styles.suggestionActions}>
                        <button>👍</button>
                        <button>👎</button>
                      </div>
                    </div>
                    <div className={styles.suggestionCard}>
                      <p>{t('Example suggestion 2')}</p>
                      <div className={styles.suggestionActions}>
                        <button>👍</button>
                        <button>👎</button>
                      </div>
                    </div>
                  </div>
                )}

                {stageInfo.id === 'voting' && (
                  <div className={styles.votingMock}>
                    <div className={styles.voteOption}>
                      <input type="radio" name="vote" />
                      <label>{t('Option A: Reduce emissions by 50%')}</label>
                    </div>
                    <div className={styles.voteOption}>
                      <input type="radio" name="vote" />
                      <label>{t('Option B: Invest in renewable energy')}</label>
                    </div>
                    <button className={styles.mockButton}>{t('Cast Vote')}</button>
                  </div>
                )}
              </div>

              {/* Display post-action feedback if configured */}
              {stageConfig.afterAction?.successMessage && (
                <div className={styles.feedbackContainer}>
                  <div className={styles.feedbackMock}>
                    <span className={styles.feedbackIcon}>✓</span>
                    <span>{stageConfig.afterAction.successMessage}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Info */}
      <div className={styles.previewInfo}>
        <div className={styles.infoCard}>
          <h4>{t('Configuration Details')}</h4>
          <dl className={styles.configList}>
            <dt>{t('Display Mode')}</dt>
            <dd>{stageConfig.beforeStage?.displayMode || globalSettings.defaultDisplayMode}</dd>

            <dt>{t('Dismissible')}</dt>
            <dd>{stageConfig.beforeStage?.dismissible !== false ? t('Yes') : t('No')}</dd>

            <dt>{t('Show Only First Time')}</dt>
            <dd>{stageConfig.beforeStage?.showOnlyFirstTime ? t('Yes') : t('No')}</dd>

            <dt>{t('Auto-dismiss')}</dt>
            <dd>{stageConfig.beforeStage?.displayDuration ? `${stageConfig.beforeStage.displayDuration}ms` : t('Manual')}</dd>
          </dl>
        </div>

        <div className={styles.infoCard}>
          <h4>{t('User Experience Notes')}</h4>
          <ul className={styles.notesList}>
            <li>{t('Users can dismiss explanations if configured')}</li>
            <li>{t('First-time explanations help onboard new users')}</li>
            <li>{t('Different display modes suit different contexts')}</li>
            <li>{t('Test with real users to validate effectiveness')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PreviewPanel;