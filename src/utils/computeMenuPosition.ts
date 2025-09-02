export type Placement = "above" | "below";

const CLAMP = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function computeMenuPosition(opts: {
  triggerRect: DOMRect;
  menuEl: HTMLElement;
  dir: "ltr" | "rtl";
  padding?: number;
  gap?: number;
  skipHiddenMeasure?: boolean;
}): { top: number; left: number; placement: Placement } {
  const {
    triggerRect: rect,
    menuEl,
    dir,
    padding = 8,
    gap = 8,
    skipHiddenMeasure = false,
  } = opts;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let measuredWidth: number;
  let measuredHeight: number;

  if (skipHiddenMeasure) {
    measuredWidth = menuEl.offsetWidth || 250;
    measuredHeight = menuEl.scrollHeight || menuEl.offsetHeight || 300;
  } else {
    const prev = {
      visibility: menuEl.style.visibility,
      opacity: menuEl.style.opacity,
      maxHeight: menuEl.style.maxHeight,
      transition: menuEl.style.transition,
    };
    menuEl.style.visibility = "hidden";
    menuEl.style.opacity = "0";
    menuEl.style.maxHeight = "none";
    menuEl.style.transition = "none";

    measuredWidth = menuEl.offsetWidth || 250;
    measuredHeight = menuEl.scrollHeight || menuEl.offsetHeight || 300;

    menuEl.style.visibility = prev.visibility;
    menuEl.style.opacity = prev.opacity;
    menuEl.style.maxHeight = prev.maxHeight;
    menuEl.style.transition = prev.transition;
  }

  // Decide above/below
  const spaceBelow = vh - rect.bottom;
  const placement: Placement =
    spaceBelow >= measuredHeight + gap + padding ? "below" : "above";

  // End-align to the dots: LTR right-to-right, RTL left-to-left
  let left = dir === "rtl" ? rect.left : rect.right - measuredWidth;
  left = CLAMP(left, padding, vw - measuredWidth - padding);

  const desiredTop =
    placement === "below" ? rect.bottom + gap : rect.top - measuredHeight - gap;
  const top = CLAMP(desiredTop, padding, vh - measuredHeight - padding);

  return { top, left, placement };
}
