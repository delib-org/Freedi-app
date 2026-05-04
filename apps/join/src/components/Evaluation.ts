import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import evaluation1 from '@/assets/evaluation/evaluation1.svg';
import evaluation2 from '@/assets/evaluation/evaluation2.svg';
import evaluation3 from '@/assets/evaluation/evaluation3.svg';
import evaluation4 from '@/assets/evaluation/evaluation4.svg';
import evaluation5 from '@/assets/evaluation/evaluation5.svg';
import { setEvaluation, getEffectiveEvaluation } from '@/lib/store';
import { t } from '@/lib/i18n';

interface EvaluationThumb {
  id: 'a' | 'b' | 'c' | 'd' | 'e';
  evaluation: number;
  svg: string;
  /** CSS variable name used as the selected-state background. */
  colorVar: string;
  altKey: string;
}

// Mirrors `enhancedEvaluationsThumbs` in the main app
// (src/view/pages/statement/components/evaluations/components/evaluation/
// enhancedEvaluation/EnhancedEvaluationModel.ts) — same five values, same
// SVGs, same -1..1 scale, so the join card writes evaluations the cloud
// function and the main app already understand without any conversion.
//
// DOM order is -1 → +1 so a plain `flex-direction: row` flows the disliked
// face at the reading-start and the liked face at the reading-end in both
// LTR and RTL (no `row-reverse` games needed).
export const evaluationThumbs: EvaluationThumb[] = [
  { id: 'e', evaluation: -1, svg: evaluation5, colorVar: '--emoji-sad', altKey: 'evaluation.dislike' },
  { id: 'd', evaluation: -0.5, svg: evaluation4, colorVar: '--emoji-thinking', altKey: 'evaluation.half_dislike' },
  { id: 'c', evaluation: 0, svg: evaluation3, colorVar: '--emoji-neutral', altKey: 'evaluation.neutral' },
  { id: 'b', evaluation: 0.5, svg: evaluation2, colorVar: '--emoji-happy', altKey: 'evaluation.half_like' },
  { id: 'a', evaluation: 1, svg: evaluation1, colorVar: '--emoji-smiley', altKey: 'evaluation.like' },
];

/** Map a stored evaluation score back to the closest thumb id, matching the
 *  main app's `getEvaluationThumbIdByScore` so a score saved by either
 *  surface highlights the same face. */
function thumbIdForScore(score: number): EvaluationThumb['id'] {
  if (score > 0.75) return 'a';
  if (score > 0.25) return 'b';
  if (score >= -0.25) return 'c';
  if (score >= -0.75) return 'd';

  return 'e';
}

interface EvaluationAttrs {
  option: Statement;
}

export const Evaluation: m.Component<EvaluationAttrs> = {
  view(vnode) {
    const { option } = vnode.attrs;
    // `getEffectiveEvaluation` returns the optimistic score if the user just
    // clicked, otherwise whatever's been confirmed by the server snapshot.
    // Either way the highlighted face matches what the user expects.
    const score = getEffectiveEvaluation(option.statementId);
    const activeId = score === undefined ? null : thumbIdForScore(score);

    // Once the user has made a choice, the parent gets a modifier class so
    // sibling (non-active) thumbs can recede further. Before any choice all
    // five faces stay equally vivid — we only introduce visual hierarchy
    // *after* the user has voted, never before.
    const groupClass = activeId === null
      ? '.evaluation'
      : '.evaluation.evaluation--has-selection';

    return m(
      groupClass,
      {
        role: 'radiogroup',
        'aria-label': t('evaluation.aria_label'),
        // The card itself is a button; the evaluation row must absorb its
        // own clicks so picking a face never navigates to chat.
        onclick: (e: Event) => e.stopPropagation(),
      },
      evaluationThumbs.map((thumb) => {
        const active = thumb.id === activeId;
        const altLabel = t(thumb.altKey);

        // Every thumb shows its full face colour. The chosen face is set
        // apart by the brand-coloured halo, scale-up, and check badge in
        // `.evaluation__thumb--active` (see _components.scss); siblings
        // additionally recede via `.evaluation--has-selection .evaluation__thumb`.
        return m(
          'button.evaluation__thumb',
          {
            key: thumb.id,
            type: 'button',
            role: 'radio',
            'aria-checked': active ? 'true' : 'false',
            'aria-label': altLabel,
            title: altLabel,
            class: active ? 'evaluation__thumb--active' : '',
            style: { backgroundColor: `var(${thumb.colorVar})` },
            onclick: (e: Event) => {
              e.stopPropagation();
              void setEvaluation(option, thumb.evaluation);
            },
          },
          m('img.evaluation__thumb-img', { src: thumb.svg, alt: altLabel }),
          // Decorative check badge — only rendered for the active face.
          // Pure CSS would also work, but rendering the element makes the
          // pulse-in animation easy to scope and skips painting it for
          // unselected faces (cheaper layer count on long lists).
          active
            ? m('span.evaluation__thumb-check', { 'aria-hidden': 'true' }, '✓')
            : null,
        );
      }),
    );
  },
};
