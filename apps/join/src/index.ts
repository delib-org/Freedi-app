import m from 'mithril';
import './styles/global.scss';
import { initAuth } from '@/lib/user';
import { Splash } from '@/views/Splash';
import { Solutions } from '@/views/Solutions';
import { Chat } from '@/views/Chat';

initAuth();

m.route.prefix = '';

const root = document.getElementById('app');
if (root) {
  m.route(root, '/', {
    '/': {
      view: () => m('.solutions', m('.solutions__empty', 'Please use a valid question link.')),
    },
    '/q/:qid/splash': {
      view: () => m(Splash, { questionId: m.route.param('qid') }),
    },
    '/q/:qid': Solutions,
    '/q/:qid/s/:sid': Chat,
  });
}
