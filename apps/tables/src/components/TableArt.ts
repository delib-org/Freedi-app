import m from 'mithril';
import { seatPoints } from '@/logic/myTable';

/** The round table drawn on My table and on the not-open screen. Colours come from the SCSS. */
const VIEW_BOX = '0 0 264 264';
const CENTER = 132;
const TABLE_RADIUS = 84;
const SEAT_ORBIT = 106;
const SEAT_RADIUS = 14;
const ME_RADIUS = 24;
const SEAT_COLOURS = 5;
const EMPTY_SEATS = 7;

function surface(): m.Vnode {
	return m('circle.table-art__surface', {
		cx: CENTER,
		cy: CENTER,
		r: TABLE_RADIUS,
		'stroke-width': 2,
	});
}

export interface MyTableArtAttrs {
	number: number;
	seatCount: number;
	label: string;
	tableWord: string;
	meWord: string;
}

export const MyTableArt: m.Component<MyTableArtAttrs> = {
	view({ attrs }) {
		const [mine, ...others] = seatPoints(Math.max(1, attrs.seatCount), CENTER, SEAT_ORBIT);

		return m('svg.table-art', { viewBox: VIEW_BOX, role: 'img', 'aria-label': attrs.label }, [
			surface(),
			m('text.table-art__word', { x: CENTER, y: 104 }, attrs.tableWord),
			m('text.table-art__number', { x: CENTER, y: 186 }, String(attrs.number)),
			others.map((seat, index) =>
				m(`circle.table-art__seat.table-art__seat--${(index % SEAT_COLOURS) + 1}`, {
					cx: seat.x,
					cy: seat.y,
					r: SEAT_RADIUS,
				}),
			),
			m('circle.table-art__me', { cx: mine.x, cy: mine.y, r: ME_RADIUS }),
			m('text.table-art__me-word', { x: mine.x, y: mine.y + 6 }, attrs.meWord),
		]);
	},
};

export const WaitingTableArt: m.Component = {
	view() {
		return m('svg.table-art.screen__art', { viewBox: VIEW_BOX, 'aria-hidden': 'true' }, [
			surface(),
			seatPoints(EMPTY_SEATS, CENTER, SEAT_ORBIT).map((seat) =>
				m('circle.table-art__seat.table-art__seat--empty', {
					cx: seat.x,
					cy: seat.y,
					r: SEAT_RADIUS,
				}),
			),
			m('circle.table-art__clock', { cx: CENTER, cy: CENTER, r: 40 }),
			m('path.table-art__clock', { d: 'M132 108v24l16 12' }),
		]);
	},
};
