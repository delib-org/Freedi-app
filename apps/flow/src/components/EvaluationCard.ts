import m from 'mithril';
import { RatingButtons } from './RatingButtons';
import { t } from '../lib/i18n';

export interface EvaluationCardAttrs {
  text: string;
  currentIndex: number;
  totalCount: number;
  ratingValue: number | null;
  onRate: (value: number) => void;
  onComment?: () => void;
  onSuggestImprovement?: () => void;
  showActions?: boolean;
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
    } = vnode.attrs;

    return m('.eval-card', {
      role: 'article',
      'aria-label': `Item ${currentIndex + 1} of ${totalCount}`,
    }, [
      m('.eval-card__counter', { 'aria-live': 'polite' },
        `${currentIndex + 1} / ${totalCount}`),
      m('.eval-card__statement', text),
      m(RatingButtons, { value: ratingValue, onRate }),
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
