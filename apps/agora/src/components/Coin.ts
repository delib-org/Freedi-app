import m from 'mithril';

export interface CoinAttrs {
	/** Rendered edge length in px */
	size?: number;
}

/** Gradient ids are document-global: every coin on the page needs its own */
let nextCoinId = 0;

/**
 * The game's coin: a sober two-metal shekel — a nickel ring around a bronze
 * core with the ₪ sign struck into it, a milled edge, and no cartoon star.
 *
 * Drawn inline, not as an <img>, so its metals are tokens (`--coin-*` in
 * tokens.scss) that a look or a forced-colours screen can re-point. The ₪ is
 * drawn as two strokes rather than typed, so it never depends on a font that
 * has the glyph.
 */
export function Coin(): m.Component<CoinAttrs> {
	const id = `agora-coin-${++nextCoinId}`;

	return {
		view(vnode) {
			const size = vnode.attrs.size ?? 32;

			return m(
				'svg.coin',
				{
					xmlns: 'http://www.w3.org/2000/svg',
					viewBox: '0 0 64 64',
					width: size,
					height: size,
					'aria-hidden': 'true',
					focusable: 'false',
				},
				[
					m('defs', [
						m('linearGradient', { id: `${id}-ring`, x1: '0', y1: '0', x2: '1', y2: '1' }, [
							m('stop.coin__stop--ring-hi', { offset: '0' }),
							m('stop.coin__stop--ring', { offset: '0.55' }),
							m('stop.coin__stop--ring-lo', { offset: '1' }),
						]),
						m('linearGradient', { id: `${id}-core`, x1: '0', y1: '0', x2: '1', y2: '1' }, [
							m('stop.coin__stop--core-hi', { offset: '0' }),
							m('stop.coin__stop--core', { offset: '0.5' }),
							m('stop.coin__stop--core-lo', { offset: '1' }),
						]),
					]),
					m('circle.coin__ring', { cx: 32, cy: 32, r: 30.5, fill: `url(#${id}-ring)` }),
					// The milled edge, the one detail every real coin has
					m('circle.coin__mill', { cx: 32, cy: 32, r: 28.6 }),
					m('circle.coin__core', { cx: 32, cy: 32, r: 20.5, fill: `url(#${id}-core)` }),
					m(
						'g.coin__sign',
						{ transform: 'translate(17.6 17.6) scale(1.2)' },
						m('path', { d: 'M5 19V5h6a3 3 0 0 1 3 3v6M19 5v14h-6a3 3 0 0 1-3-3v-6' }),
					),
				],
			);
		},
	};
}
