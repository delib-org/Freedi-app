import m from 'mithril';
import QRCode from 'qrcode';
import { t } from '../lib/i18n';
import { loadDeliberation, Deliberation } from '../lib/deliberation';

export interface ShareScreenAttrs {
  deliberationId: string;
}

export function ShareScreen(): m.Component<ShareScreenAttrs> {
  let deliberation: Deliberation | null = null;
  let loading = true;
  let copied = false;
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;
  let qrRendered = false;

  function getShareUrl(id: string): string {
    const origin = window.location.origin;
    return `${origin}/#!/d/${id}`;
  }

  function getShareMessage(title: string, url: string): string {
    return `${t('share.invite_message')}: ${title}\n${t('share.join')}: ${url}`;
  }

  function renderQR(canvas: HTMLCanvasElement, url: string): void {
    if (qrRendered) return;
    qrRendered = true;

    QRCode.toCanvas(canvas, url, {
      width: 240,
      margin: 2,
      color: {
        dark: '#4a3347',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).catch((err: unknown) => {
      console.error('[Share] QR render failed:', err);
    });
  }

  async function copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      m.redraw();
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copied = false;
        m.redraw();
      }, 3000);
    } catch (err: unknown) {
      console.error('[Share] Copy failed:', err);
    }
  }

  async function webShare(title: string, url: string): Promise<void> {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title,
        text: getShareMessage(title, url),
        url,
      });
    } catch (err: unknown) {
      // User cancelled — not an error
      if ((err as Error).name !== 'AbortError') {
        console.error('[Share] Web Share failed:', err);
      }
    }
  }

  return {
    oninit(vnode) {
      loadDeliberation(vnode.attrs.deliberationId).then((delib) => {
        deliberation = delib;
        loading = false;
        m.redraw();
      }).catch((err: unknown) => {
        console.error('[Share] Load failed:', err);
        loading = false;
        m.redraw();
      });
    },

    view(vnode) {
      const { deliberationId } = vnode.attrs;
      const url = getShareUrl(deliberationId);

      if (loading) {
        return m('.shell', m('.shell__content.text-center', { style: { justifyContent: 'center' } }, t('common.loading')));
      }

      const title = deliberation?.title ?? '';
      const message = getShareMessage(title, url);
      const encodedMessage = encodeURIComponent(message);

      return m('.shell', [
        m('.shell__content', { style: { gap: 'var(--space-lg)', textAlign: 'center' } }, [
          m('h1.create-title', t('share.live_title')),
          m('p.share-subtitle', `"${title}"`),

          // QR Code — scannable from screen
          m('.qr-container', [
            m('.qr-box', [
              m('canvas.qr-box__canvas', {
                oncreate(vnode: m.VnodeDOM) {
                  renderQR(vnode.dom as HTMLCanvasElement, url);
                },
              }),
            ]),
            m('p.qr-box__hint', t('share.scan_to_join')),
          ]),

          // Share buttons
          m('.share-buttons', [
            m('.share-buttons__label', t('share.via')),
            m('.share-buttons__row', [
              // Web Share API (mobile)
              typeof navigator.share === 'function'
                ? m('button.share-btn.share-btn--native', {
                    onclick: () => webShare(title, url),
                    'aria-label': t('share.share_native'),
                  }, [
                    m('.share-btn__icon', '📤'),
                    m('.share-btn__label', t('share.share_native')),
                  ])
                : null,

              // WhatsApp
              m('a.share-btn.share-btn--whatsapp[target=_blank]', {
                href: `https://wa.me/?text=${encodedMessage}`,
                'aria-label': 'WhatsApp',
              }, [
                m('.share-btn__icon', '💬'),
                m('.share-btn__label', 'WhatsApp'),
              ]),

              // Email
              m('a.share-btn.share-btn--email[target=_blank]', {
                href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedMessage}`,
                'aria-label': 'Email',
              }, [
                m('.share-btn__icon', '✉'),
                m('.share-btn__label', 'Email'),
              ]),
            ]),
          ]),

          // Copy link
          m('.copy-link', [
            m('.copy-link__label', t('share.or_copy')),
            m('.copy-link__row', [
              m('.copy-link__url', url),
              m('button.btn.btn--primary.btn--sm', {
                onclick: () => copyLink(url),
                'aria-label': t('share.copy_link'),
              }, copied ? t('share.copied') : t('share.copy')),
            ]),
            copied
              ? m('.copy-link__feedback', { role: 'status' }, t('share.link_copied'))
              : null,
          ]),
        ]),

        m('.shell__footer', [
          m('button.btn.btn--secondary.btn--full', {
            onclick: () => m.route.set('/my'),
          }, t('share.go_to_dashboard')),
        ]),
      ]);
    },
  };
}
