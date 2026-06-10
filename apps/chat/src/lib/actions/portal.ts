/**
 * Svelte action that moves an element to `document.body` (or a target) so it
 * escapes any ancestor that establishes a containing block for fixed-position
 * elements — e.g. an ancestor with `backdrop-filter`/`transform`/`filter`
 * (the glass topbar + notification center) or `overflow: hidden`. Without this,
 * a `position: fixed` modal is clipped to that ancestor instead of the viewport.
 */
export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
	let targetEl: HTMLElement | null = null;

	function mount(t: HTMLElement | string) {
		targetEl = typeof t === 'string' ? document.querySelector<HTMLElement>(t) : t;
		targetEl?.appendChild(node);
	}

	mount(target);

	return {
		update(t: HTMLElement | string) {
			mount(t);
		},
		destroy() {
			node.parentNode?.removeChild(node);
		},
	};
}
