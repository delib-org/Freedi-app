/**
 * Shared behaviour of the console bar's native <details> popovers (settings,
 * projector menu): Escape closes and returns focus to the summary, and a click
 * anywhere else closes it too.
 */

/** The slice of a mithril DOM vnode these helpers use, so any component's vnode fits. */
interface PopoverVnode {
	dom: Element;
	state: unknown;
}

interface PopoverState {
	onDocumentClick?: (event: MouseEvent) => void;
}

export function closePopover(details: HTMLDetailsElement, returnFocus: boolean): void {
	if (!details.open) return;
	details.open = false;
	if (returnFocus) details.querySelector<HTMLElement>('summary')?.focus();
}

/** `onkeydown` for the <details> element. */
export function popoverKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') closePopover(event.currentTarget as HTMLDetailsElement, true);
}

/** Call from `oncreate`: closes the popover on a click outside it. */
export function bindOutsideClose(vnode: PopoverVnode): void {
	const details = vnode.dom as HTMLDetailsElement;
	const state = vnode.state as PopoverState;
	state.onDocumentClick = (event: MouseEvent) => {
		if (!details.contains(event.target as Node)) closePopover(details, false);
	};
	document.addEventListener('click', state.onDocumentClick);
}

/** Call from `onremove`. */
export function unbindOutsideClose(vnode: PopoverVnode): void {
	const { onDocumentClick } = vnode.state as PopoverState;
	if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
}
