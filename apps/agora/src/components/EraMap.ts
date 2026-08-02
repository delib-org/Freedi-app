import m from 'mithril';
import type { AgoraParticipant } from '@freedi/shared-types';

export interface EraMapLantern {
	id: string;
	/** 0..1 — consensus/support drives the glow */
	brightness: number;
	/** 0..1 — share of support coming from the left camp (colors the ring) */
	leftShare: number;
	/** 0..1 — bridging score colors toward gold as camps agree */
	bridging: number;
	isMine?: boolean;
}

export interface EraMapAttrs {
	participants: AgoraParticipant[];
	/** Participant to highlight (the viewer's own marker) */
	myParticipantId?: string;
	/** Idea lanterns filling the town square during deliberation */
	lanterns?: EraMapLantern[];
	/** Endings: the city prospers or burns */
	mood?: 'neutral' | 'prosperous' | 'dusk' | 'ruined';
	/** 'bottom' anchors the crop to the ground line (the world-strip panorama) */
	crop?: 'center' | 'bottom';
}

/**
 * The 2.5D era map — the game hub. Phase 1 renders the night city
 * (portal, palace, assembly, bridge, town square, observatory) and pops
 * an anonymous glowing marker near the portal for every participant.
 *
 * All drawing stays behind this component's interface so the renderer
 * can later be swapped (e.g. PixiJS) without touching any view.
 */

const MAP_W = 1000;
const MAP_H = 560;

/** Deterministic pseudo-random in [0,1) from a string (marker placement) */
function hash01(input: string, salt: number): number {
	let hash = 2166136261 ^ salt;
	for (let index = 0; index < input.length; index++) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return ((hash >>> 0) % 1000) / 1000;
}

/** Scatter participants in the staging area in front of the portal */
function markerPosition(participantId: string): { x: number; y: number } {
	const angle = hash01(participantId, 1) * Math.PI; // fan in front of portal
	const radius = 55 + hash01(participantId, 2) * 130;

	return {
		x: 175 + Math.cos(angle * 0.7) * radius,
		y: 468 + Math.sin(angle) * 36,
	};
}

// Daytime: the old stars become soft white cloud flecks (bigger, fewer-look)
const STAR_POSITIONS: Array<[number, number, number]> = Array.from({ length: 26 }, (_, index) => [
	hash01(`star-${index}`, 3) * MAP_W,
	hash01(`star-${index}`, 4) * 190,
	2 + hash01(`star-${index}`, 5) * 3.5,
]);

/** Idea lanterns hang inside the town-square ellipse (cx 505, cy 470) */
function lanternPosition(id: string): { x: number; y: number } {
	const angle = hash01(id, 6) * Math.PI * 2;
	const radial = Math.sqrt(hash01(id, 7));

	return {
		x: 505 + Math.cos(angle) * 125 * radial,
		y: 462 + Math.sin(angle) * 26 * radial,
	};
}

/** Blend camp color by left share, pulled toward sun-gold by bridging */
function lanternRingColor(leftShare: number, bridging: number): string {
	const left = { r: 138, g: 82, b: 207 }; // --camp-left (royal purple)
	const right = { r: 20, g: 160, b: 143 }; // --camp-right (teal)
	const gold = { r: 255, g: 210, b: 63 }; // sun-gold (bridging)
	const base = {
		r: left.r * leftShare + right.r * (1 - leftShare),
		g: left.g * leftShare + right.g * (1 - leftShare),
		b: left.b * leftShare + right.b * (1 - leftShare),
	};
	const mix = (a: number, b: number) => Math.round(a * (1 - bridging) + b * bridging);

	return `rgb(${mix(base.r, gold.r)}, ${mix(base.g, gold.g)}, ${mix(base.b, gold.b)})`;
}

function building(x: number, y: number, width: number, height: number, fill: string): m.Children {
	return m('rect', { x, y: y - height, width, height, fill, rx: 2 });
}

export const EraMap: m.Component<EraMapAttrs> = {
	view(vnode) {
		const {
			participants,
			myParticipantId,
			lanterns = [],
			mood = 'neutral',
			crop = 'center',
		} = vnode.attrs;

		return m('.era-map', { 'aria-hidden': 'true' }, [
			m(
				'svg',
				{
					viewBox: `0 0 ${MAP_W} ${MAP_H}`,
					preserveAspectRatio: crop === 'bottom' ? 'xMidYMax slice' : 'xMidYMid slice',
					role: 'img',
				},
				[
					m('defs', [
						m('linearGradient', { id: 'em-sky', x1: '0', y1: '0', x2: '0', y2: '1' }, [
							m('stop', { offset: '0%', 'stop-color': '#7ec3f2' }),
							m('stop', { offset: '58%', 'stop-color': '#b9e0fa' }),
							m('stop', { offset: '100%', 'stop-color': '#e9f5fe' }),
						]),
						m('linearGradient', { id: 'em-ground', x1: '0', y1: '0', x2: '0', y2: '1' }, [
							m('stop', { offset: '0%', 'stop-color': '#a5da88' }),
							m('stop', { offset: '100%', 'stop-color': '#7cbd60' }),
						]),
						m('radialGradient', { id: 'em-portal', cx: '50%', cy: '50%', r: '50%' }, [
							m('stop', { offset: '0%', 'stop-color': '#b98df0', 'stop-opacity': '0.95' }),
							m('stop', { offset: '55%', 'stop-color': '#8a52cf', 'stop-opacity': '0.55' }),
							m('stop', { offset: '100%', 'stop-color': '#8a52cf', 'stop-opacity': '0' }),
						]),
						m('radialGradient', { id: 'em-glow', cx: '50%', cy: '50%', r: '50%' }, [
							m('stop', { offset: '0%', 'stop-color': '#ffd23f', 'stop-opacity': '0.9' }),
							m('stop', { offset: '100%', 'stop-color': '#ffd23f', 'stop-opacity': '0' }),
						]),
					]),

					// --- Layer 1: sky ---
					m('rect', { width: MAP_W, height: MAP_H, fill: 'url(#em-sky)' }),
					STAR_POSITIONS.map(([x, y, r], index) =>
						m('circle.era-map__star', {
							cx: x,
							cy: y,
							r,
							fill: '#ffffff',
							style: `animation-delay: ${(index % 7) * 0.5}s`,
						}),
					),
					m('circle', { cx: 830, cy: 86, r: 34, fill: '#ffd23f', opacity: 0.95 }),

					// --- Layer 2: distant city silhouette ---
					m('path', {
						d: 'M0 320 L60 320 L70 290 L80 320 L150 320 L150 300 L170 300 L170 320 L260 320 L275 275 L290 320 L420 320 L420 305 L450 285 L480 305 L480 320 L610 320 L620 300 L640 300 L648 282 L656 300 L676 300 L688 320 L800 320 L812 296 L824 320 L1000 320 L1000 560 L0 560 Z',
						fill: '#bcd9ec',
					}),

					// --- Layer 3: ground plane ---
					m('path', {
						d: `M0 360 Q 250 330 500 356 T 1000 352 L ${MAP_W} ${MAP_H} L 0 ${MAP_H} Z`,
						fill: 'url(#em-ground)',
					}),

					// --- Layer 4: locations ---
					// Time portal (west) — arrival point
					m('g', [
						m('ellipse', { cx: 150, cy: 430, rx: 84, ry: 96, fill: 'url(#em-portal)' }),
						m('g.era-map__portal-swirl', [
							m('ellipse', {
								cx: 150,
								cy: 430,
								rx: 52,
								ry: 66,
								fill: 'none',
								stroke: '#b98df0',
								'stroke-width': 2.5,
								'stroke-dasharray': '10 14',
								opacity: 0.8,
							}),
							m('ellipse', {
								cx: 150,
								cy: 430,
								rx: 34,
								ry: 46,
								fill: 'none',
								stroke: '#e6dcff',
								'stroke-width': 1.5,
								'stroke-dasharray': '4 10',
								opacity: 0.9,
							}),
						]),
					]),

					// Palace (left camp seat) on a western rise
					m('g', [
						m('path', { d: 'M250 392 Q 330 368 410 392 L 410 400 L 250 400 Z', fill: '#8cc973' }),
						building(280, 392, 100, 62, '#e3d8c4'),
						building(268, 392, 16, 78, '#d3c6ab'),
						building(376, 392, 16, 78, '#d3c6ab'),
						m('path', { d: 'M276 314 L284 300 L292 314 Z', fill: '#8a52cf' }),
						m('path', { d: 'M384 314 L392 300 L400 314 Z', fill: '#8a52cf' }),
						[296, 318, 340].map((x) =>
							m('rect.era-map__window', {
								x,
								y: 348,
								width: 9,
								height: 14,
								fill: '#b98df0',
								rx: 1.5,
							}),
						),
					]),

					// Assembly (right camp seat) on an eastern rise
					m('g', [
						m('path', { d: 'M600 396 Q 690 372 780 396 L 780 404 L 600 404 Z', fill: '#8cc973' }),
						building(630, 396, 120, 54, '#e3d8c4'),
						m('path', { d: 'M624 342 L690 316 L756 342 Z', fill: '#14a08f' }),
						[640, 664, 688, 712].map((x) =>
							m('rect', { x, y: 356, width: 8, height: 40, fill: '#cbbfa4' }),
						),
						[648, 676, 704].map((x) =>
							m('rect.era-map__window', {
								x,
								y: 362,
								width: 9,
								height: 13,
								fill: '#0e8f80',
								rx: 1.5,
							}),
						),
					]),

					// Bridge between palace and assembly (positioning scale)
					m('path', {
						d: 'M410 384 Q 505 352 600 388',
						fill: 'none',
						stroke: '#a97e52',
						'stroke-width': 7,
						'stroke-linecap': 'round',
					}),
					m('path', {
						d: 'M410 384 Q 505 352 600 388',
						fill: 'none',
						stroke: '#e8d3a8',
						'stroke-width': 2.5,
						'stroke-linecap': 'round',
						'stroke-dasharray': '2 16',
					}),

					// Town square — the agora (deliberation heart)
					m('g', [
						m('ellipse', { cx: 505, cy: 470, rx: 150, ry: 40, fill: '#f2e4c6', opacity: 0.9 }),
						m('ellipse', {
							cx: 505,
							cy: 470,
							rx: 108,
							ry: 27,
							fill: 'none',
							stroke: '#d8c294',
							'stroke-width': 2,
						}),
						// central obelisk
						m('path', { d: 'M500 470 L503 404 L507 404 L510 470 Z', fill: '#d3c6ab' }),
						m('circle', { cx: 505, cy: 398, r: 12, fill: 'url(#em-glow)' }),
						m('circle', { cx: 505, cy: 398, r: 4, fill: '#ffd23f' }),
					]),

					// Observatory (period explainer) on the far eastern hill
					m('g', [
						m('path', { d: 'M840 384 Q 900 358 968 384 L 968 392 L 840 392 Z', fill: '#8cc973' }),
						building(880, 384, 48, 40, '#e3d8c4'),
						m('path', { d: 'M878 344 A 26 26 0 0 1 930 344 Z', fill: '#c96f4a' }),
						m('line', {
							x1: 904,
							y1: 330,
							x2: 922,
							y2: 306,
							stroke: '#4d5c8f',
							'stroke-width': 3,
							'stroke-linecap': 'round',
						}),
					]),

					// --- Layer 4.5: fate of the realm (endings) ---
					mood === 'prosperous'
						? m('g', [
								[300, 380, 505, 660, 720, 905].map((x, index) =>
									m('circle.era-map__marker-glow', {
										cx: x,
										cy: 380 - (index % 3) * 14,
										r: 26,
										fill: 'url(#em-glow)',
										opacity: 0.5,
									}),
								),
								m('rect', {
									width: MAP_W,
									height: MAP_H,
									fill: '#ffd23f',
									opacity: 0.1,
								}),
							])
						: null,
					// Dignified twilight — honest disagreement: no smoke, no fires,
					// a few lanterns still burning while the light softens
					mood === 'dusk'
						? m('g', [
								[505, 660].map((x, index) =>
									m('circle.era-map__marker-glow', {
										cx: x,
										cy: 372 - index * 10,
										r: 22,
										fill: 'url(#em-glow)',
										opacity: 0.35,
									}),
								),
								m('rect', {
									width: MAP_W,
									height: MAP_H,
									fill: '#f2a65e',
									opacity: 0.2,
								}),
							])
						: null,
					mood === 'ruined'
						? m('g', [
								[330, 690, 505].map((x, index) =>
									m('g', { key: `smoke-${index}` }, [
										m('ellipse.era-map__smoke', {
											cx: x,
											cy: 300 - index * 10,
											rx: 34,
											ry: 16,
											fill: '#9a97a5',
											opacity: 0.75,
										}),
										m('ellipse.era-map__smoke', {
											cx: x + 14,
											cy: 262 - index * 10,
											rx: 26,
											ry: 13,
											fill: '#b3b0bd',
											opacity: 0.6,
										}),
										m('circle', {
											cx: x,
											cy: 348,
											r: 12,
											fill: '#d13d4e',
											opacity: 0.45,
										}),
									]),
								),
								m('rect', {
									width: MAP_W,
									height: MAP_H,
									fill: '#54486a',
									opacity: 0.22,
								}),
							])
						: null,

					// --- Layer 5: idea lanterns in the town square ---
					lanterns.map((lantern) => {
						const { x, y } = lanternPosition(lantern.id);
						const glow = 0.25 + lantern.brightness * 0.75;
						const ring = lanternRingColor(lantern.leftShare, lantern.bridging);

						return m('g.era-map__marker', { key: `lantern-${lantern.id}` }, [
							m('circle.era-map__marker-glow', {
								cx: x,
								cy: y,
								r: 10 + lantern.brightness * 10,
								fill: 'url(#em-glow)',
								opacity: glow,
							}),
							m('circle', {
								cx: x,
								cy: y,
								r: lantern.isMine ? 6 : 4.5,
								// Ownership on the map too: my idea-dot is my blue
								fill: lantern.isMine ? '#2b6fd6' : '#e07714',
								opacity: 0.55 + lantern.brightness * 0.45,
								stroke: ring,
								'stroke-width': lantern.isMine ? 3 : 2,
							}),
						]);
					}),

					// --- Layer 6: participant markers (staging by the portal) ---
					participants.map((participant) => {
						const { x, y } = markerPosition(participant.participantId);
						const isMine = participant.participantId === myParticipantId;

						return m('g.era-map__marker', { key: participant.participantId }, [
							m('circle.era-map__marker-glow', {
								cx: x,
								cy: y,
								r: isMine ? 16 : 11,
								fill: 'url(#em-glow)',
							}),
							m('circle', {
								cx: x,
								cy: y,
								r: isMine ? 5.5 : 4,
								fill: isMine ? '#2b6fd6' : '#e07714',
								stroke: '#ffffff',
								'stroke-width': 1,
							}),
						]);
					}),
				],
			),
		]);
	},
};
