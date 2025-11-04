# 🔔 Notification Permission Prompt Component

Beautiful, modern notification permission prompts for the Freedi app, designed to appear after a user posts their first comment.

## 📋 Table of Contents

- [Overview](#overview)
- [Variants](#variants)
- [Installation](#installation)
- [Usage](#usage)
- [Props API](#props-api)
- [Accessibility](#accessibility)
- [Design Rationale](#design-rationale)
- [Recommendations](#recommendations)

---

## Overview

The `NotificationPermissionPrompt` component provides three beautiful, modern variants for requesting notification permissions. Each variant follows the Freedi design system and is fully accessible, responsive, and animated.

### Key Features

✅ **Three Beautiful Variants**: Minimal, Card, and Glass morphism styles
✅ **Fully Accessible**: WCAG AA compliant with ARIA labels and keyboard navigation
✅ **Responsive**: Mobile-first design that works on all screen sizes
✅ **Smooth Animations**: Playful entrance animations with reduced-motion support
✅ **Design System Aligned**: Uses Freedi CSS variables and patterns
✅ **TypeScript**: Fully typed with proper interfaces

---

## Variants

### 🎯 Variant A: Minimal (Recommended)

**Style**: Clean, subtle bottom snackbar
**Animation**: Slide up with bounce
**Best For**: Non-intrusive, friendly notification request

**Visual Characteristics**:
- White background with subtle shadow
- Compact, rounded corners (12px)
- Slides up from bottom with playful bounce
- Actions right-aligned
- Clean typography

**When to Use**:
- After user's first comment (primary use case)
- When you want minimal disruption
- Mobile-friendly quick action

**Mobile Behavior**:
- Full-width on small screens
- Stacked buttons on phones

```tsx
<NotificationPermissionPrompt
  variant="minimal"
  isVisible={showPrompt}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
/>
```

---

### 🎨 Variant B: Card

**Style**: Card with bell icon and close button
**Animation**: Rise with scale
**Best For**: Engaging users with visual elements

**Visual Characteristics**:
- Gradient bell icon (blue → teal)
- 48px icon container with shadow
- Close button (X) in top-right
- More visual presence than minimal
- Icon animates with bell ring effect

**When to Use**:
- When you want more visual engagement
- For important first-time permissions
- When icon helps clarify the action

**Mobile Behavior**:
- Icon scales down to 40px
- Full-width with stacked buttons

```tsx
<NotificationPermissionPrompt
  variant="card"
  isVisible={showPrompt}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
/>
```

---

### ✨ Variant C: Glass Morphism

**Style**: Modern glass effect with gradient accents
**Animation**: Float with subtle glow
**Best For**: Premium, modern aesthetic

**Visual Characteristics**:
- Frosted glass background (blur + transparency)
- Gradient border effect (blue → teal → green)
- Glowing icon with pulsing aura
- Centered content layout
- Gradient button background

**When to Use**:
- For a premium, modern feel
- When design is a key differentiator
- For special occasions or features

**Mobile Behavior**:
- Icon scales to 48px
- Full-width with stacked buttons
- Glass effect maintained

```tsx
<NotificationPermissionPrompt
  variant="glass"
  isVisible={showPrompt}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
/>
```

---

## Installation

The component is already created in:
```
/src/view/components/notifications/NotificationPermissionPrompt.tsx
/src/view/components/notifications/NotificationPermissionPrompt.module.scss
```

### Dependencies

- **React**: Already in project
- **Lucide React**: Already in project (for Bell and X icons)
- **TypeScript**: Already configured

No additional installation required!

---

## Usage

### Basic Example

```tsx
import React, { useState } from 'react';
import NotificationPermissionPrompt from '@/view/components/notifications/NotificationPermissionPrompt';

function MyComponent() {
  const [showPrompt, setShowPrompt] = useState(false);

  const handleAccept = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.info('Notifications enabled!');
    }
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    console.info('User chose not now');
    setShowPrompt(false);
  };

  return (
    <>
      <button onClick={() => setShowPrompt(true)}>
        Show Prompt
      </button>

      <NotificationPermissionPrompt
        variant="minimal"
        isVisible={showPrompt}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
      />
    </>
  );
}
```

### After First Comment (Real Use Case)

```tsx
import React, { useState, useEffect } from 'react';
import NotificationPermissionPrompt from '@/view/components/notifications/NotificationPermissionPrompt';
import useNotifications from '@/controllers/hooks/useNotifications';

function CommentSection() {
  const [showPrompt, setShowPrompt] = useState(false);
  const { requestPermission, permissionState } = useNotifications();

  const handleCommentPosted = async (isFirstComment: boolean) => {
    if (isFirstComment && permissionState.permission === 'default') {
      // Wait 1 second after posting, then show prompt
      setTimeout(() => {
        setShowPrompt(true);
      }, 1000);
    }
  };

  const handleAccept = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      // Subscribe to push notifications
      console.info('Subscribed to notifications');
    }
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    // Track dismissal, maybe show again later
    localStorage.setItem('notificationPromptDismissed', Date.now().toString());
    setShowPrompt(false);
  };

  return (
    <>
      {/* Your comment UI */}

      <NotificationPermissionPrompt
        variant="minimal"
        isVisible={showPrompt}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
        message="Get notified when people respond to your comment?"
      />
    </>
  );
}
```

### Custom Message

```tsx
<NotificationPermissionPrompt
  variant="card"
  isVisible={showPrompt}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
  message="Stay in the loop! Get updates when your group makes decisions."
/>
```

### Auto-Hide After Delay

```tsx
<NotificationPermissionPrompt
  variant="minimal"
  isVisible={showPrompt}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
  autoHideDelay={10000} // Auto-hide after 10 seconds
/>
```

---

## Props API

### `NotificationPermissionPromptProps`

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `variant` | `'minimal' \| 'card' \| 'glass'` | `'minimal'` | No | Visual variant to display |
| `isVisible` | `boolean` | - | **Yes** | Controls visibility of the prompt |
| `onAccept` | `() => void` | - | **Yes** | Callback when user clicks "Yes, Notify Me" |
| `onDismiss` | `() => void` | - | **Yes** | Callback when user clicks "Not Now" or auto-hides |
| `message` | `string` | `'Get notified when people respond to your comment?'` | No | Custom message text |
| `autoHideDelay` | `number` | `undefined` | No | Auto-hide after X milliseconds |

### Type Definitions

```tsx
export type PromptVariant = 'minimal' | 'card' | 'glass';

interface NotificationPermissionPromptProps {
  variant?: PromptVariant;
  onAccept: () => void;
  onDismiss: () => void;
  isVisible: boolean;
  message?: string;
  autoHideDelay?: number;
}
```

---

## Accessibility

All variants are fully accessible and follow WCAG AA standards:

### Keyboard Navigation

✅ **Tab Navigation**: All buttons are keyboard accessible
✅ **Focus Indicators**: Clear focus outlines on all interactive elements
✅ **Escape Key**: Dismisses prompt (built-in browser behavior)

### Screen Readers

✅ **ARIA Labels**: All buttons have descriptive labels
✅ **Role**: Proper `role="dialog"` for screen readers
✅ **Live Region**: `aria-live="polite"` for announcements
✅ **Semantic HTML**: Proper button and heading tags

### Visual Accessibility

✅ **Color Contrast**: All text meets 4.5:1 ratio
✅ **Focus Visible**: 2px outline on focus
✅ **Large Touch Targets**: Minimum 44x44px on mobile

### Motion Sensitivity

✅ **Reduced Motion**: Respects `prefers-reduced-motion`
✅ **No Flash**: No rapidly flashing animations
✅ **Smooth Transitions**: All animations are subtle

```scss
@media (prefers-reduced-motion: reduce) {
  .notificationPrompt {
    animation: none !important;
  }
}
```

### High Contrast Mode

✅ **Border Support**: Borders added in high-contrast mode
✅ **No Color-Only Info**: Icons and text provide context

---

## Design Rationale

### Why Three Variants?

Different contexts require different levels of visual prominence:

1. **Minimal**: Perfect for the primary use case (after first comment) - non-intrusive, friendly
2. **Card**: Better for onboarding flows or when you need more engagement
3. **Glass**: For premium experiences or when design is a differentiator

### Design System Alignment

All variants use:
- ✅ Freedi CSS variables (`--btn-primary`, `--agree`, etc.)
- ✅ 8-point spacing grid (`var(--padding)`)
- ✅ Design system colors (no hardcoded hex)
- ✅ Consistent border radius patterns
- ✅ Typography scale and fonts
- ✅ Shadow system for depth

### Animation Philosophy

Following Freedi's design guide:
- **Timing**: 300-500ms for UI elements
- **Easing**: Playful cubic-bezier for personality
- **Purpose**: Every animation serves a purpose (entrance, attention)
- **Reduced Motion**: Always respected

### Mobile-First Approach

All variants are designed mobile-first:
- Responsive breakpoints at 768px and 480px
- Touch-friendly buttons (min 44x44px)
- Full-width on small screens
- Stacked buttons on phones

---

## Recommendations

### 🏆 Primary Recommendation: **Minimal Variant**

**Why?**
1. **Non-intrusive**: Appears after first comment without disrupting flow
2. **Fast**: Quickest to comprehend and act on
3. **Mobile-friendly**: Works perfectly on all screen sizes
4. **Conversion-optimized**: Clear call-to-action without overwhelming
5. **Design system aligned**: Follows existing snackbar patterns

**Use Case**: After user posts their first comment

**Implementation**:
```tsx
<NotificationPermissionPrompt
  variant="minimal"
  isVisible={showAfterFirstComment}
  onAccept={handleEnableNotifications}
  onDismiss={handleNotNow}
  message="Get notified when people respond to your comment?"
/>
```

---

### When to Use Each Variant

| Variant | Use Case | User Intent | Visual Hierarchy |
|---------|----------|-------------|------------------|
| **Minimal** | After first comment, ongoing prompts | Low friction | Subtle |
| **Card** | Onboarding, feature announcement | Medium engagement | Moderate |
| **Glass** | Premium features, special events | High engagement | Prominent |

---

### Best Practices

1. **Timing**: Show 1-2 seconds after user posts first comment
2. **Frequency**: Don't show again if user dismissed (respect their choice)
3. **Message**: Keep it concise and user-focused
4. **Context**: Only show when notification permission is "default" (not granted/denied)
5. **Follow-up**: If accepted, show success feedback

### Example Flow

```tsx
const handleCommentPosted = (isFirstComment: boolean) => {
  // 1. Check if first comment
  if (!isFirstComment) return;

  // 2. Check permission state
  if (Notification.permission !== 'default') return;

  // 3. Check if previously dismissed (optional)
  const dismissed = localStorage.getItem('notificationPromptDismissed');
  if (dismissed) {
    const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) return; // Don't show again for 7 days
  }

  // 4. Show prompt after short delay
  setTimeout(() => {
    setShowPrompt(true);
  }, 1000);
};
```

---

## Testing

### Visual Testing

Test all variants on:
- ✅ Mobile (< 480px)
- ✅ Tablet (768px - 1024px)
- ✅ Desktop (> 1024px)

### Interaction Testing

- ✅ Click "Yes, Notify Me" → calls `onAccept`
- ✅ Click "Not Now" → calls `onDismiss`
- ✅ Click X (card variant) → calls `onDismiss`
- ✅ Auto-hide → calls `onDismiss` after delay

### Accessibility Testing

- ✅ Keyboard navigation works
- ✅ Screen reader announces content
- ✅ Focus visible on all elements
- ✅ Reduced motion respected

---

## Examples

See `NotificationPermissionPrompt.example.tsx` for:
- All variants comparison
- Integration with hooks
- After first comment flow
- Custom messages
- Auto-hide examples

---

## Browser Support

Works in all modern browsers:
- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers

**Note**: `backdrop-filter` (glass variant) has 95%+ browser support. Falls back gracefully on older browsers.

---

## Future Enhancements

Potential future additions:
- Sound/vibration on entrance (optional)
- Success/error states
- Multi-step permission flow
- Preview notification example
- Permission rationale screen

---

## Questions?

For questions or issues:
1. Check the examples in `NotificationPermissionPrompt.example.tsx`
2. Review the design guide: `/docs/design-guide.md`
3. Check component props and TypeScript definitions

---

**Last Updated**: 2025-11-04
**Component Version**: 1.0.0
**Design System**: Freedi v2.0.0
