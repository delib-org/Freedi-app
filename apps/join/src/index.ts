import m from 'mithril';
import './styles/global.scss';
import { initAuth } from '@/lib/user';
import { initI18n, t } from '@/lib/i18n';
import { Splash } from '@/views/Splash';
import { Solutions } from '@/views/Solutions';
import { Chat } from '@/views/Chat';
import { MainHub } from '@/views/MainHub';

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
    // Facilitated routes — entry via a main (top-parent) statement. Solutions
    // and Chat detect facilitated mode via the /m/ prefix on the active route.
    '/m/:mid': MainHub,
    '/m/:mid/q/:qid': Solutions,
    '/m/:mid/q/:qid/s/:sid': Chat,
  });
}
