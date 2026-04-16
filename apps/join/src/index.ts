import m from 'mithril';
import './styles/global.scss';
import { initAuth } from '@/lib/user';
import { initI18n, t } from '@/lib/i18n';
import { Splash } from '@/views/Splash';
import { Solutions } from '@/views/Solutions';
import { Chat } from '@/views/Chat';

initAuth();
initI18n();

m.route.prefix = '';

const root = document.getElementById('app');
if (root) {
  m.route(root, '/', {
    '/': {
      view: () => m('.solutions', m('.solutions__empty', t('solutions.error.invalid_link'))),
    },
    '/q/:qid/splash': {
      view: () => m(Splash, { questionId: m.route.param('qid') }),
    },
    '/q/:qid': Solutions,
    '/q/:qid/s/:sid': Chat,
  });
}
