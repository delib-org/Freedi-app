# Zone-Based Swipe System - Developer Guide

## Quick Start

The zone-based swipe system divides the card into 5 vertical strips, each representing a rating value. The center strip has special vertical-only behavior for neutral ratings.

## Usage

The `SwipeCard` component automatically uses the zone-based system. No changes needed to existing code:

```tsx
import SwipeCard from '@/components/swipe/SwipeCard';

<SwipeCard
  statement={statement}
  onSwipe={(rating) => console.log('Rating:', rating)}
  totalCards={10}
  currentIndex={0}
/>
```

## User Interaction

### Horizontal Swipe (Left/Right Zones)
1. User touches/clicks on left or right zones
2. Drags horizontally
3. Active zone highlights with bright color and emoji
4. Card content dims to opacity 0.4
5. Release → Card throws left/right with corresponding rating

### Vertical Swipe (Center Zone)
1. User touches/clicks on center (yellow) zone
2. Horizontal movement is locked
3. Can only drag vertically upward
4. Upward arrow (↑) indicator appears at bottom
5. Must swipe up 100px to trigger neutral rating
6. Insufficient swipe → Card returns to idle

### Button Clicks
- Rating buttons still work as before
- Trigger immediate throw animation
- Bypass manual swipe interaction

## Zone Configuration

Modify `src/constants/common.ts`:

```typescript
// Adjust thresholds
export const ZONES = {
  TOTAL_ZONES: 5,
  CENTER_ZONE_INDEX: 2,
  VERTICAL_SWIPE_THRESHOLD: 100, // Change this for sensitivity
  STRIP_IDLE_OPACITY: 0.15, // Adjust strip visibility
  STRIP_ACTIVE_OPACITY: 0.9,
  CARD_DIM_OPACITY: 0.4,
} as const;

// Customize zone mappings
export const ZONE_CONFIG = [
  { index: 0, rating: -1, emoji: '🚫' },
  { index: 1, rating: -0.5, emoji: '👎' },
  { index: 2, rating: 0, emoji: '↑' },
  { index: 3, rating: 0.5, emoji: '👍' },
  { index: 4, rating: 1, emoji: '🎉' },
] as const;
```

## Styling Customization

Modify `src/styles/molecules/_swipe-card.scss`:

```scss
.swipe-card__zone {
  // Change idle opacity
  opacity: 0.15; // Default: very subtle

  // Zone colors (use CSS custom properties)
  &--zone-0 { background: var(--rating-strongly-disagree); }
  &--zone-1 { background: var(--rating-disagree); }
  &--zone-2 { background: var(--rating-neutral); }
  &--zone-3 { background: var(--rating-agree); }
  &--zone-4 { background: var(--rating-strongly-agree); }

  // Active state
  &--active {
    opacity: 0.9; // Highlighted
  }
}

// Customize emoji size
.swipe-card__zone-emoji {
  font-size: 3rem; // Adjust size
}

// Customize content dimming
.swipe-card--dragging .swipe-card__content-wrapper {
  opacity: 0.4; // Adjust dim level
}
```

## Color Palette

Colors are defined in `app/globals.css`:

```css
:root {
  --rating-strongly-agree: #dcfce7; /* Green */
  --rating-agree: #d1fae5; /* Light green */
  --rating-neutral: #f1f5f9; /* Gray */
  --rating-disagree: #fef3c7; /* Yellow */
  --rating-strongly-disagree: #fee2e2; /* Red */
}
```

## Debugging

Enable console logs to track zone interactions:

```typescript
// In SwipeCard.tsx, add debugging:
const handleDragMove = useCallback((clientX: number, clientY: number) => {
  // ... existing code ...

  console.log('Current zone:', currentZone);
  console.log('Is vertical drag:', isVerticalDrag);
  console.log('Position:', { dragX, dragY });
}, [/* deps */]);
```

## Common Issues

### Zones not visible
- Check opacity in SCSS (should be 0.15 for idle)
- Verify CSS custom properties are defined
- Ensure `overflow: hidden` on card

### Center zone not locking horizontal
- Verify `isVerticalDrag` state is set correctly
- Check `ZONES.CENTER_ZONE_INDEX === 2`
- Console log `dragStartZone` to debug

### Emojis not showing during drag
- Check `highlightedZone` state
- Verify `--active` class is applied
- Ensure emoji opacity transitions work

### Content not dimming
- Verify `.swipe-card--dragging` class is applied
- Check `CARD_DIM_OPACITY` constant value
- Ensure content wrapper has transition

## Performance Tips

1. **Don't override RAF**: The component uses `requestAnimationFrame` for smooth updates
2. **CSS transitions**: Disabled during drag for better performance
3. **Will-change hints**: Already optimized for transform properties
4. **Cleanup**: RAF is automatically cleaned up on unmount

## Accessibility

The zone system maintains full accessibility:

- ✅ Screen reader announces card position
- ✅ Keyboard navigation (via rating buttons)
- ✅ ARIA labels for all interactive elements
- ✅ Reduced motion support (disables transitions)
- ✅ Focus management

## Testing Checklist

- [ ] Drag horizontally on left/right zones
- [ ] Verify active zone highlights
- [ ] Check content dims during drag
- [ ] Drag vertically from center zone
- [ ] Verify horizontal movement locks
- [ ] Check upward arrow indicator appears
- [ ] Swipe up 100px from center → neutral rating
- [ ] Insufficient upward swipe → card returns
- [ ] Click rating buttons → works as before
- [ ] Mobile touch gestures work
- [ ] Desktop mouse drag works
- [ ] No console errors

## Migration from Old System

If upgrading from distance-based swipe:

**Before** (distance-based):
```typescript
// Swipe distance determined rating
if (dragX >= 160) rating = 1;
else if (dragX >= 80) rating = 0.5;
// etc.
```

**After** (zone-based):
```typescript
// Zone position determines rating
const zone = calculateCurrentZone(dragX);
const rating = ZONE_CONFIG[zone].rating;
```

**No code changes needed** - the component handles this automatically!

## Advanced Customization

### Custom Zone Count

To change from 5 zones to N zones:

1. Update `ZONES.TOTAL_ZONES` constant
2. Update `ZONE_CONFIG` array with N entries
3. Update CSS zone colors (add/remove `&--zone-N` classes)
4. Test thoroughly!

### Custom Gestures

To add new gesture types:

1. Add state for gesture detection
2. Implement gesture logic in `handleDragMove`
3. Update `handleDragEnd` to handle new gesture
4. Add visual feedback in SCSS/JSX

### Analytics Integration

Track swipe interactions:

```typescript
const handleDragEnd = useCallback(() => {
  // ... existing code ...

  // Analytics
  if (isVerticalDrag) {
    analytics.track('vertical_swipe_neutral');
  } else {
    analytics.track('horizontal_swipe', {
      zone: currentZone,
      rating: ZONE_CONFIG[currentZone].rating,
    });
  }
}, [/* deps */]);
```

## Support

For issues or questions:
1. Check this guide
2. Review `ZONE_SWIPE_IMPLEMENTATION.md`
3. Inspect browser console for errors
4. Test on `http://localhost:3001/s/[survey-id]/q/0`
