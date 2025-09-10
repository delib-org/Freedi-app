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
    gap = 4,
    skipHiddenMeasure = false,
  } = opts;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw <= 768;

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

  // Position menu directly adjacent to the button
  let left: number;
  let top: number;
  let placement: Placement = "below";
  
  // Vertical positioning - align top of menu with top of button
  top = rect.top;
  
  // Horizontal positioning - position to the left of the button (since it's RTL)
  if (dir === "rtl") {
    // RTL: Position menu to the left of the button
    left = rect.left - measuredWidth - gap;
    
    // If not enough space on the left, position to the right
    if (left < padding) {
      left = rect.right + gap;
      
      // If still doesn't fit on the right, position below button instead
      if (left + measuredWidth > vw - padding) {
        // Fall back to positioning below the button
        top = rect.bottom + gap;
        left = rect.left;
        placement = "below";
        
        // Ensure menu fits on screen
        if (left + measuredWidth > vw - padding) {
          left = rect.right - measuredWidth;
        }
        if (left < padding) {
          left = padding;
        }
      }
    }
  } else {
    // LTR: Position menu to the right of the button
    left = rect.right + gap;
    
    // If not enough space on the right, position to the left
    if (left + measuredWidth > vw - padding) {
      left = rect.left - measuredWidth - gap;
      
      // If still doesn't fit on the left, position below button instead
      if (left < padding) {
        // Fall back to positioning below the button
        top = rect.bottom + gap;
        left = rect.right - measuredWidth;
        placement = "below";
        
        // Ensure menu fits on screen
        if (left < padding) {
          left = rect.left;
          if (left + measuredWidth > vw - padding) {
            left = vw - measuredWidth - padding;
          }
        }
      }
    }
  }
  
  // Check if menu extends below viewport when positioned to the side
  if (placement !== "below" && top + measuredHeight > vh - padding) {
    // Adjust vertical position to fit
    top = Math.max(padding, vh - measuredHeight - padding);
  }
  
  // Mobile adjustments
  if (isMobile) {
    // On mobile, center the menu below/above the button
    const buttonCenter = rect.left + rect.width / 2;
    left = buttonCenter - measuredWidth / 2;
    
    // Ensure menu stays within screen bounds
    left = CLAMP(left, padding, vw - measuredWidth - padding);
  }
  
  // Final boundary checks
  top = CLAMP(top, padding, vh - measuredHeight - padding);
  left = CLAMP(left, padding, vw - measuredWidth - padding);

  return { top, left, placement };
}
