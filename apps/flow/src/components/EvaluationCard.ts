import m from 'mithril';
import { RatingButtons } from './RatingButtons';
import { t } from '../lib/i18n';
import type { RatingMode } from '@freedi/shared-types';

export interface EvaluationCardAttrs {
  text: string;
  currentIndex: number;
  totalCount: number;
  ratingValue: number | null;
  onRate: (value: number) => void;
  onComment?: () => void;
  onSuggestImprovement?: () => void;
  showActions?: boolean;
  /** Evaluation mode from the parent statement's `statementSettings.ratingMode`. */
  mode?: RatingMode;
}

export const EvaluationCard: m.Component<EvaluationCardAttrs> = {
  view(vnode) {
    const {
      text,
      currentIndex,
      totalCount,
      ratingValue,
      onRate,
      onComment,
      onSuggestImprovement,
      showActions = false,
      mode,
    } = vnode.attrs;

    return m('.eval-card', {
      role: 'article',
      'aria-label': `Item ${currentIndex + 1} of ${totalCount}`,
    }, [
      m('.eval-card__counter', { 'aria-live': 'polite' },
        `${currentIndex + 1} / ${totalCount}`),
      m('.eval-card__statement', text),
      m(RatingButtons, { value: ratingValue, onRate, mode }),
      showActions
        ? m('.eval-card__actions', [
            onComment
              ? m(
                  'button.eval-card__action-btn',
                  { onclick: onComment, 'aria-label': t('eval.comment') },
                  [`💬 ${t('eval.comment')}`]
                )
              : null,
            onSuggestImprovement
              ? m(
                  'button.eval-card__action-btn',
                  { onclick: onSuggestImprovement, 'aria-label': t('eval.suggest') },
                  [`✏️ ${t('eval.suggest')}`]
                )
              : null,
          ])
        : null,
    ]);
  },
};
