'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyExplanationPage } from '@freedi/shared-types';
import { createCompletionMessage } from '@/lib/utils/completionMessage';
import ExplanationEditor from './ExplanationEditor';
import adminStyles from './Admin.module.scss';
import styles from './CompletionMessageEditor.module.scss';

interface CompletionMessageEditorProps {
  /** The admin's message on the last page; undefined = none. */
  message?: SurveyExplanationPage;
  /** Pictures upload into this survey's folder; without one (a survey not yet created) they wait. */
  surveyId?: string;
  onChange: (message: SurveyExplanationPage | undefined) => void;
}

/**
 * The survey's last page, pinned under the flow. The admin adds and edits its
 * message exactly like an explanation page — same card, same editor.
 */
export default function CompletionMessageEditor({
  message,
  surveyId,
  onChange,
}: CompletionMessageEditorProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const handleAdd = () => {
    onChange(createCompletionMessage(t('Message on the last page')));
    setExpanded(true);
  };

  const handleRemove = () => {
    onChange(undefined);
    setExpanded(false);
  };

  return (
    <div className={styles.completionMessage}>
      <h3 className={styles.completionMessage__title}>{t('Last page')}</h3>
      <p className={styles.completionMessage__hint}>
        {t('Participants see the last page after the final question. You can add your own message to it.')}
      </p>

      {message ? (
        <div className={clsx(adminStyles.flowItemCard, expanded && adminStyles.expanded)}>
          <div className={adminStyles.flowItemHeader}>
            <span className={clsx(adminStyles.flowItemBadge, adminStyles.explanation)}>
              {t('Last page')}
            </span>
            <span className={adminStyles.flowItemTitle}>{message.title}</span>
            <button
              type="button"
              className={adminStyles.flowExpandButton}
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={t('Message on the last page')}
            >
              {expanded ? '▲' : '▼'}
            </button>
            <button type="button" className={adminStyles.flowRemoveButton} onClick={handleRemove}>
              {t('remove') || 'Remove'}
            </button>
          </div>

          {expanded && (
            <div className={adminStyles.flowItemContent}>
              <ExplanationEditor
                page={message}
                surveyId={surveyId}
                onUpdate={(updates) => onChange({ ...message, ...updates })}
                onRemove={handleRemove}
                removeLabel={t('Remove message')}
              />
            </div>
          )}
        </div>
      ) : (
        <div className={adminStyles.addFlowItemButtons}>
          <button type="button" className={adminStyles.addExplanationButton} onClick={handleAdd}>
            + {t('Add a message on the last page')}
          </button>
        </div>
      )}
    </div>
  );
}
