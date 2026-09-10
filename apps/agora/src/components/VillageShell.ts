import m from 'mithril';
import type { AgoraStagePlanItem } from '@freedi/shared-types';
import { acceptsVillageEntry, villagePlace } from '../lib/flows/villageRoute';
import { planItemLabel } from './StageNav';

interface VillageShellAttrs {
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	viewingIndex: number;
	papers: Array<{ text: string; own: boolean }>;
}

export function VillageShell(): m.Component<VillageShellAttrs> {
	let frame: HTMLIFrameElement | null = null;
	let attrs: VillageShellAttrs;
	let opened = false;
	let itemId = '';
	let ready = false;
	let unavailable = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function sync(): void {
		const item = attrs.plan[attrs.viewingIndex];
		if (!item) return;
		frame?.contentWindow?.postMessage(
			{
				type: 'agora-village-state',
				itemId: item.itemId,
				place: villagePlace(item),
				label: planItemLabel(item),
				paused: opened,
				papers: attrs.papers,
			},
			window.location.origin,
		);
	}
	function receive(event: MessageEvent<unknown>): void {
		if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return;
		const payload = event.data;
		if (
			payload &&
			typeof payload === 'object' &&
			'type' in payload &&
			payload.type === 'agora-village-ready'
		) {
			ready = true;
			unavailable = false;
			clearTimeout(timer);
			sync();
			m.redraw();
		} else if (acceptsVillageEntry(payload, attrs.plan, attrs.currentIndex, attrs.viewingIndex)) {
			opened = true;
			sync();
			m.redraw();
		}
	}

	return {
		oninit(vnode) {
			attrs = vnode.attrs;
			window.addEventListener('message', receive);
		},
		onremove() {
			window.removeEventListener('message', receive);
			clearTimeout(timer);
		},
		onbeforeupdate(vnode) {
			attrs = vnode.attrs;
			const next = attrs.plan[attrs.viewingIndex]?.itemId ?? '';
			if (next !== itemId) {
				itemId = next;
				opened = false;
			}
		},
		onupdate: sync,
		view(vnode) {
			attrs = vnode.attrs;
			itemId = attrs.plan[attrs.viewingIndex]?.itemId ?? '';

			return m('.village-shell', [
				m('.village-shell__toolbar', [
					m('strong', 'סנהדרין · כפר החכמים'),
					m(
						'button.btn.btn--secondary.btn--sm',
						{
							onclick: () => {
								opened = !opened;
								sync();
							},
						},
						opened ? 'חזרה לכפר' : 'כניסה ישירה לתחנה',
					),
				]),
				m('iframe.village-shell__world', {
					src: '/prototypes/olive-hill/village.html?embedded=1',
					title: 'כפר החכמים בתלת־מימד',
					oncreate: (node: m.VnodeDOM) => {
						frame = node.dom as HTMLIFrameElement;
						timer = setTimeout(() => {
							if (!ready) {
								unavailable = true;
								m.redraw();
							}
						}, 15000);
					},
					onload: sync,
				}),
				unavailable && !opened
					? m(
							'p.village-shell__notice',
							'הכפר לא נטען במכשיר הזה. אפשר להיכנס ישירות לתחנה ולהמשיך במפגש.',
						)
					: null,
				m(
					'.village-shell__activity',
					{ style: { display: opened ? 'block' : 'none' } },
					vnode.children,
				),
			]);
		},
	};
}
