import m from 'mithril';

interface SplashAttrs {
  questionId: string;
}

export const Splash: m.Component<SplashAttrs> = {
  oncreate(vnode) {
    const questionId = vnode.attrs.questionId;
    setTimeout(() => {
      m.route.set('/q/:qid', { qid: questionId });
    }, 3000);
  },

  view() {
    return m('.splash', [
      m('img.splash__logo', {
        src: '/favicon.svg',
        alt: 'Freedi',
      }),
      m('.splash__text', 'Freedi'),
    ]);
  },
};
