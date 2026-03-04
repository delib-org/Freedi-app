import m from 'mithril';
import { submitStatement, loadStatements, findSimilar, StatementData, SessionState, saveSession } from '../lib/deliberation';
import { ProgressBar } from '../components/ProgressBar';
import { t } from '../lib/i18n';

export interface NeedsWriteAttrs {
  questionId: string;
  topParentId: string;
  session: SessionState;
  maxNeeds: number;
  onDone: () => void;
}

export function NeedsWrite(initialVnode: m.Vnode<NeedsWriteAttrs>): m.Component<NeedsWriteAttrs> {
  let text = '';
  let submitting = false;
  const submitted: string[] = [];
  let existingStatements: StatementData[] = [];
  let similarWarning: { text: string; percent: number } | null = null;

  loadStatements(initialVnode.attrs.questionId).then((all) => {
    existingStatements = all;
    m.redraw();
  });

  function checkSimilarity(): void {
    if (text.trim().length < 10) {
      similarWarning = null;
      return;
    }
    const matches = findSimilar(text, existingStatements, 0.4);
    if (matches.length > 0) {
      similarWarning = {
        text: matches[0].statement.statement,
        percent: Math.round(matches[0].similarity * 100),
      };
    } else {
      similarWarning = null;
    }
  }

  async function doSubmit(questionId: string, topParentId: string, session: SessionState): Promise<void> {
    submitting = true;
    m.redraw();
    try {
      await submitStatement(questionId, topParentId, text.trim());
      submitted.push(text.trim());
      text = '';
      similarWarning = null;
      session.needsWritten = submitted.length;
      saveSession(session);
    } catch (error) {
      console.error('[NeedsWrite] Submit failed:', error);
    } finally {
      submitting = false;
      m.redraw();
    }
  }

  return {
    view(vnode) {
      const { questionId, topParentId, session, maxNeeds, onDone } = vnode.attrs;
      const canSubmitMore = submitted.length < maxNeeds;

      return m('.shell', [
        m('.shell__header', [
          m(ProgressBar, {
            current: submitted.length,
            total: maxNeeds,
            label: `${submitted.length} ${t('needs.of')} ${maxNeeds}`,
          }),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h2', {
            style: { fontSize: 'var(--font-size-xl)', textAlign: 'center' },
          }, t('needs.title')),

          m('p', {
            style: { color: 'var(--text-secondary)', textAlign: 'center' },
          }, t('needs.subtitle')),

          m('.text-input', [
            m('textarea.text-input__field', {
              placeholder: t('needs.placeholder'),
              value: text,
              disabled: submitting || !canSubmitMore,
              oninput: (e: Event) => {
                text = (e.target as HTMLTextAreaElement).value;
                checkSimilarity();
              },
            }),
            m('.text-input__counter', `${text.length} / 500`),
          ]),

          // Similarity warning
          similarWarning
            ? m('.similarity-warning', [
                m('.similarity-warning__title', t('similarity.title')),
                m('.similarity-warning__text',
                  t('similarity.message', { percent: similarWarning.percent })),
                m('p.similarity-warning__match', `"${similarWarning.text}"`),
                m('.similarity-warning__actions', [
                  m('button.btn.btn--secondary', {
                    style: { flex: 1 },
                    onclick: () => { similarWarning = null; },
                  }, t('similarity.edit')),
                  m('button.btn.btn--primary', {
                    style: { flex: 1 },
                    disabled: text.trim().length < 3 || submitting,
                    onclick: () => doSubmit(questionId, topParentId, session),
                  }, t('similarity.submit_anyway')),
                ]),
              ])
            : canSubmitMore
              ? m('button.btn.btn--primary', {
                  disabled: text.trim().length < 3 || submitting,
                  onclick: () => {
                    if (similarWarning) return; // let them decide
                    checkSimilarity();
                    if (similarWarning) { m.redraw(); return; }
                    doSubmit(questionId, topParentId, session);
                  },
                }, submitting ? t('needs.submitting') : t('needs.submit'))
              : null,

          submitted.length > 0
            ? m('.card', [
                m('.card__title', t('needs.your_needs')),
                ...submitted.map((txt, i) =>
                  m('p.card__text', { style: { marginTop: 'var(--space-sm)' } }, `${i + 1}. ${txt}`)
                ),
              ])
            : null,
        ]),

        m('.shell__footer', [
          submitted.length > 0
            ? m('button.btn.btn--primary', { onclick: onDone },
                canSubmitMore ? t('needs.continue') : t('common.continue'))
            : null,
        ]),
      ]);
    },
  };
}
