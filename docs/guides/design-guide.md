# Freedi App Design Guide

> A comprehensive UX/UI design system for building intuitive, accessible, and visually cohesive experiences in the Freedi collaborative decision-making platform.

## Table of Contents
- [Design Philosophy](#design-philosophy)
- [Visual Design System](#visual-design-system)
- [Atomic Design Architecture](#atomic-design-architecture)
- [BEM Methodology](#bem-methodology)
- [Component Library](#component-library)
- [UX Patterns](#ux-patterns)
- [Interaction Design](#interaction-design)
- [Accessibility](#accessibility)
- [Responsive Design](#responsive-design)
- [Practical Guidelines](#practical-guidelines)

---

## Design Philosophy

### Core Principles

#### 1. **Clarity Through Simplicity**
The Freedi app embraces visual minimalism to reduce cognitive load. Every element serves a purpose, creating an environment where users focus on collective decision-making rather than navigating complex interfaces.

#### 2. **Progressive Disclosure**
Information reveals itself as needed. Users see essential content first, with advanced features and detailed information appearing contextually. This prevents overwhelm while maintaining powerful functionality.

#### 3. **Emotional Intelligence**
The design acknowledges the emotional weight of collaborative decision-making. Soft curves, calming colors, and gentle animations create a supportive environment for potentially challenging conversations.

#### 4. **Cultural Sensitivity**
Full RTL/LTR support ensures equal experiences across cultures. Visual elements adapt intelligently to reading direction without compromising the design integrity.

### User-Centered Approach
- **Intuitive Navigation**: Users should find their way naturally, guided by visual hierarchy and familiar patterns
- **Immediate Feedback**: Every action receives instant visual confirmation
- **Error Prevention**: Design prevents mistakes rather than correcting them
- **Accessibility First**: Inclusive design ensures participation for all users

---

## Visual Design System

### Color Palette

#### Primary Colors
The color system creates visual hierarchy while maintaining emotional balance:

**Main Brand Colors**
- `--mainBackground: #1f5895` - Deep trust blue, used for primary headers and key CTAs
- `--statementBackground: #f2f6ff` - Soft sky background, creates breathing room
- `--accent: #7cacf8` - Bright accent for interactive elements

**Semantic Colors**
- `--agree: #57c6b2` - Teal for positive consensus
- `--disagree: #fe6ba2` - Soft pink for disagreement (non-aggressive)
- `--approve: #4fab9a` - Success green with optimistic tone
- `--reject: #f74a4d` - Warning red, used sparingly

**Statement Type Colors**
- `--question: #47b4ef` - Bright blue for questions
- `--option: #e7d080` - Warm yellow for options
- `--group: #b893e7` - Purple for group activities
- `--result: #a9adf4` - Lavender for outcomes

#### Color Usage Guidelines

1. **Emotional Mapping**: Colors guide emotional response
   - Cool blues for thinking and reflection
   - Warm greens for agreement and progress
   - Soft pinks/reds for disagreement (avoiding aggression)
   - Purples for community and group activities

2. **Accessibility Considerations**
   - All color combinations meet WCAG AA standards
   - Contrast variants available for high-contrast mode
   - Never rely solely on color to convey information

### Typography System

#### Font Families
```scss
Primary: 'Roboto', sans-serif      // Clean, modern, highly readable
Body: 'Open Sans', sans-serif      // Friendly, approachable
Accent: 'Patrick Hand', cursive    // Human touch for special elements
```

#### Type Scale
The typography follows a harmonious scale that ensures readability across devices:

```scss
--h1-font-size: 2rem (32px)        // Page titles
--h2-font-size: 1.7rem (27px)      // Section headers
--h3-font-size: 1.5rem (24px)      // Subsection headers
--h4-font-size: 1.3rem (21px)      // Card titles
--h5-font-size: 1.2rem (19px)      // Emphasis text
--h6-font-size: 1.1rem (18px)      // Large body
--p-font-size: 1rem (17px)         // Standard body text
```

#### Typography Principles
- **Line Height**: 150% for body text ensures comfortable reading
- **Font Weight**: Limited to 400 (regular) and 500 (medium) for consistency
- **Responsive Sizing**: Base font size of 17px provides optimal mobile readability

### Spacing System

The app uses an 8-point grid system with consistent spacing tokens:

```scss
Base unit: 0.5rem (8px)
--padding: 1rem (16px)
```

**Spacing Scale:**
- `0.25rem` - Tight spacing between related elements
- `0.5rem` - Default spacing within components
- `1rem` - Standard padding and margins
- `1.5rem` - Section spacing
- `2rem` - Major section breaks

### Visual Effects

#### Shadows
Layered shadow system creates depth hierarchy:

```scss
// Subtle elevation
box-shadow: 0px 3px 6px rgba(115, 138, 191, 0.1)

// Card elevation
box-shadow: 0px 3px 6px #4162862b

// Modal/overlay elevation
box-shadow: 0px 20px 50px #21253633
```

#### Border Radius
- Small elements: `3px` - Subtle softness
- Buttons: `20px` - Friendly, approachable
- Cards: `8px` - Modern card feel
- Modals: `0.5rem` - Consistent with spacing system

---

## Atomic Design Architecture

The Freedi design system is built using **Atomic Design Methodology** - a modular approach that breaks interfaces into fundamental building blocks.

### Philosophy

Think of interface design like chemistry:
- **Atoms** are the basic building blocks (buttons, inputs, icons)
- **Molecules** are combinations of atoms (cards, forms, search boxes)
- **Organisms** are complex combinations of molecules (headers, navigation)
- **Templates** define page structures
- **Pages** are instances of templates with real content

### Why Atomic Design?

1. **Consistency**: Reusing the same atoms ensures visual consistency
2. **Maintainability**: Changes to an atom propagate everywhere
3. **Scalability**: Easy to add new components following established patterns
4. **Collaboration**: Clear hierarchy helps teams understand the system
5. **Performance**: Single source of truth reduces CSS duplication

### File Structure

```
src/view/style/
├── _mixins.scss              # Reusable SCSS mixins
├── atoms/
│   ├── _index.scss           # Import all atoms
│   ├── _button.scss          # Button styles (BEM)
│   ├── _input.scss           # Input styles (BEM)
│   ├── _badge.scss           # Badge styles (BEM)
│   └── ...
├── molecules/
│   ├── _index.scss           # Import all molecules
│   ├── _card.scss            # Card styles (BEM)
│   ├── _modal.scss           # Modal styles (BEM)
│   ├── _toast.scss           # Toast styles (BEM)
│   └── ...
└── style.scss                # Main import file
```

### Component Types

#### Atoms (Basic Building Blocks)

**Definition**: Single-purpose, indivisible UI elements.

**Examples**:
- Button - Clickable action trigger
- Input - Text input field
- Checkbox - Boolean selection
- Icon - SVG icon display
- Badge - Notification indicator
- Chip - Dismissible label
- Avatar - User profile image

**Characteristics**:
- Self-contained and reusable
- No dependencies on other components
- Highly configurable through variants
- All styling in SCSS files

#### Molecules (Combinations of Atoms)

**Definition**: Groups of atoms functioning together as a unit.

**Examples**:
- Card - Container with header/body/footer
- Modal - Backdrop + card + close button
- Form Group - Label + input + error message
- Search Box - Input + icon + clear button
- Toast - Message + icon + close button

**Characteristics**:
- Composed of multiple atoms
- Represents a single functional unit
- More complex than atoms but still reusable
- All styling in SCSS files

### React Components as Wrappers

**IMPORTANT**: React components are **TypeScript wrappers only** - they don't contain styling logic.

```typescript
// ✅ CORRECT: Minimal TypeScript wrapper
const Button: React.FC<ButtonProps> = ({ text, variant, onClick }) => {
  return (
    <button className={`button button--${variant}`} onClick={onClick}>
      <span className="button__text">{text}</span>
    </button>
  );
};

// ❌ WRONG: Don't put styling in components
const Button = styled.button`
  background: blue;
  padding: 1rem;
`;
```

**Benefits**:
- All styling in SCSS (single source of truth)
- No runtime CSS-in-JS overhead
- Better performance and caching
- Easier to maintain and update

---

## BEM Methodology

BEM (Block Element Modifier) is a naming convention that makes CSS predictable, maintainable, and scalable.

### What is BEM?

**BEM** = **B**lock **E**lement **M**odifier

```
.block               // Component
.block__element      // Part of the component
.block--modifier     // Variant of the component
```

### Why BEM?

1. **Predictability**: Names clearly describe purpose and structure
2. **Reusability**: Components are self-contained
3. **Maintainability**: Easy to find and modify styles
4. **No Conflicts**: Unique names prevent style collisions
5. **Flat Hierarchy**: No deep nesting, better performance

### BEM Naming Rules

#### Block (Component Base)
```scss
.button { }           // ✅ Single word, lowercase
.card { }             // ✅ Describes what it is
.search-box { }       // ✅ Multi-word with hyphen
```

#### Element (Part of Block)
```scss
.button__text { }     // ✅ Double underscore
.button__icon { }     // ✅ Describes part of button
.card__header { }     // ✅ Part of card
.card__footer { }     // ✅ Another part of card
```

#### Modifier (Variant of Block or Element)
```scss
.button--primary { }           // ✅ Double hyphen
.button--large { }             // ✅ Size variant
.button--disabled { }          // ✅ State variant
.card__header--centered { }    // ✅ Element modifier
```

### BEM Examples

#### Button Atom
```scss
// Block (base component)
.button {
  display: inline-flex;
  padding: 0.4rem 1rem;
  border-radius: 20px;

  // Elements (parts of button)
  &__text {
    padding: 0 0.5rem;
  }

  &__icon {
    width: 2rem;
    height: 2rem;
  }

  // Modifiers (variants)
  &--primary {
    background: var(--btn-primary);
    color: var(--white);
  }

  &--secondary {
    background: var(--white);
    color: var(--btn-secondary);
  }

  &--large {
    font-size: 1.2rem;
    padding: 0.6rem 1.5rem;
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
```

**HTML Usage**:
```html
<!-- Primary button -->
<button class="button button--primary">
  <span class="button__text">Submit</span>
</button>

<!-- Large secondary button -->
<button class="button button--secondary button--large">
  <span class="button__text">Cancel</span>
</button>

<!-- Primary button with icon -->
<button class="button button--primary">
  <span class="button__icon">→</span>
  <span class="button__text">Next</span>
</button>
```

#### Card Molecule
```scss
// Block
.card {
  background: var(--card-default);
  border-radius: 8px;
  padding: var(--padding);

  // Elements
  &__header {
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-light);
  }

  &__title {
    font-size: var(--h4-font-size);
    color: var(--text-title);
  }

  &__body {
    padding: 1rem 0;
  }

  &__footer {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-light);
  }

  // Modifiers
  &--elevated {
    box-shadow: var(--shadow-elevated);
  }

  &--question {
    background: var(--card-question-added);
    border-left: 4px solid var(--question);
  }

  &--compact {
    padding: 0.75rem;
  }
}
```

**HTML Usage**:
```html
<!-- Elevated question card -->
<div class="card card--elevated card--question">
  <div class="card__header">
    <h3 class="card__title">Question Title</h3>
  </div>
  <div class="card__body">
    Content goes here
  </div>
  <div class="card__footer">
    <button class="button button--primary">Vote</button>
  </div>
</div>
```

### BEM Anti-Patterns (What NOT to Do)

```scss
// ❌ WRONG: Don't nest blocks
.card .button { }

// ❌ WRONG: Don't create grandchild elements
.card__header__title { }

// ❌ WRONG: Don't use tag selectors with BEM
.button a { }

// ❌ WRONG: Don't combine blocks in CSS
.card.button { }

// ✅ CORRECT: Flat structure
.card { }
.card__header { }
.card__title { }
.card--elevated { }
```

### BEM Best Practices

1. **Keep it Flat**: Avoid deep nesting
   ```scss
   // ✅ Good
   .card__header { }
   .card__title { }

   // ❌ Bad
   .card__header__title { }
   ```

2. **One Block per File**: Each SCSS file = one block
   ```
   _button.scss    → .button
   _card.scss      → .card
   _modal.scss     → .modal
   ```

3. **Use Modifiers for Variants**: Don't create new blocks
   ```scss
   // ✅ Good
   .button--large { }
   .button--primary { }

   // ❌ Bad
   .large-button { }
   .primary-button { }
   ```

4. **Elements Belong to Blocks**: Not to other elements
   ```scss
   // ✅ Good
   .card__header { }
   .card__title { }  // Belongs to card, not header

   // ❌ Bad
   .card__header__title { }
   ```

5. **Use Context Classes for Complex States**:
   ```html
   <!-- ✅ Add state to container -->
   <div class="card card--loading">
     <div class="card__body">...</div>
   </div>
   ```

### BEM with SCSS Nesting

SCSS allows nesting while maintaining flat CSS output:

```scss
.button {
  padding: 0.4rem 1rem;

  // Elements (nesting for organization)
  &__text {
    padding: 0 0.5rem;
  }

  &__icon {
    width: 2rem;
  }

  // Modifiers (nesting for organization)
  &--primary {
    background: var(--btn-primary);
  }

  &--large {
    font-size: 1.2rem;
  }
}

// Compiles to flat CSS:
// .button { }
// .button__text { }
// .button__icon { }
// .button--primary { }
// .button--large { }
```

### Combining Multiple Modifiers

```html
<!-- Multiple modifiers on one element -->
<button class="button button--primary button--large button--full-width">
  Large Primary Button
</button>

<!-- Card with multiple states -->
<div class="card card--elevated card--question card--selected">
  Selected Question Card
</div>
```

---

## Component Library

### Buttons

#### Primary Button
**Visual Description**: Solid blue background with white text, rounded corners (20px radius), subtle shadow for depth. On hover, background lightens slightly with smooth transition.

**Usage**: Main actions like "Submit", "Continue", "Create"

```scss
.btn--primary {
  background: #5f88e5
  color: white
  padding: 0.4rem 1rem
  border-radius: 20px
  box-shadow: layered shadow system
}
```

#### Secondary Button
**Visual Description**: White background with blue border and text. Same rounded corners as primary. On hover, background subtly tints blue.

**Usage**: Alternative actions, "Cancel", "Back"

#### Specialized Buttons
- **Approve Button**: Green (#4fab9a) for positive actions
- **Reject Button**: Transparent with red border for negative actions
- **Floating Action Button (FAB)**: Circular, elevated with strong shadow

### Cards

#### Statement Card
**Visual Description**: Clean white background with subtle shadow, 8px rounded corners. Content has generous padding. Hover state adds slight elevation.

**Behavioral States**:
- Default: White background
- Question Added: Light blue tint (#d9f0fc)
- Suggestion Added: Light yellow (#fdffe0)
- Other User's Message: Wheat tone (#faf6f0)

#### Message Card
**Visual Description**: Chat-bubble style with colored left/right border indicating message type. User's messages align right with white background, others' messages align left with light green (#dcf8c6).

#### Similar Card (Modern Pattern)
**Visual Description**: Light gray background (#f8f8f8) with soft rounded corners (8px). Subtle shadow that lifts on hover. Selected state features green accent with left border.

**Interaction**:
- Hover: Lifts 2px with enhanced shadow
- Active: Presses down 1px
- Selected: Green tint with thick left border

### Form Elements

#### Input Fields
**Visual Description**: Clean white background, no visible border in rest state. On focus, subtle blue glow appears. Placeholder text in muted blue (#93b6da).

```scss
Features:
- Rounded corners (3px)
- Internal padding (0.5rem)
- Smooth focus transition
```

#### Custom Toggle Switch
**Visual Description**: Pill-shaped track (220px wide) with circular thumb that slides. Inactive state is gray, active is blue. Smooth animation (0.15s) on toggle.

### Loading States

#### SuggestionLoader
**Visual Description**: Full-screen overlay with gradient blue background. White card contains:
- Animated dots (pulsing scale effect)
- Progress bar with gradient fill and glow
- Dynamic messaging that updates
- Icon animations (bounce effect)

**UX Purpose**: Transforms wait time into engaging experience, reducing perceived loading time through visual interest and informative messaging.

### Modals & Overlays

#### Modal
**Visual Description**: Dark semi-transparent backdrop, white content card rises from bottom with scale animation. Rounded corners, strong shadow for elevation.

#### Toast Notifications
**Visual Description**: Appears from top with "jump in" animation. Blue background (#6db0f9) with white text. Auto-dismisses after displaying message.

---

## UX Patterns

### Navigation Patterns

#### Tab Navigation
**Visual Description**: Horizontal row of options. Selected tab gets white pill background with colored text matching section theme. Smooth transition between states.

**Behavior**:
- Non-selected tabs are semi-transparent (0.7 opacity)
- Selected tab scales slightly and becomes fully opaque
- On mobile, tab text hides leaving only icons

#### Page Headers
**Visual Description**: Colored header bar with distinctive rounded corner (bottom-right for LTR, bottom-left for RTL). Contains back button, title, and action buttons.

**Color Coding**:
- Home: Blue (#5f88e5)
- Questions: Light blue (#47b4ef)
- Groups: Purple (#b893e7)

### User Feedback Patterns

#### Progressive Loading
The app uses multi-stage loading feedback:

1. **Immediate**: Skeleton screens for structure
2. **Short wait**: Animated spinner
3. **Long wait**: SuggestionLoader with progress and messages

#### Action Feedback
- **Button press**: Scale down animation (0.95)
- **Success**: Green checkmark with fade-in
- **Error**: Red highlight with shake animation
- **Processing**: Pulsing opacity on element

### Empty States

**Visual Description**: Centered illustration or icon, friendly message, and clear CTA. Uses muted colors to avoid overwhelming empty spaces.

### Error States

**Visual Description**: Red border/background highlight, clear error message below field, icon indicator. Non-aggressive styling maintains calm environment.

### Mass Consensus Flow

#### Stage Explanation Screens
**Visual Description**: Full-screen takeover with centered content. Large emoji icon (120px) in circular background, followed by title and description. Info boxes with checkmark lists explain process.

**UX Purpose**: Educational moments that build user confidence and understanding of the consensus process.

---

## Interaction Design

### Micro-interactions

#### Hover Effects
- Buttons: Lighten background by 10%
- Cards: Elevate with enhanced shadow
- Links: Underline appears with slide animation

#### Click/Tap Feedback
- Buttons: Scale to 0.95 with spring animation
- Cards: Subtle press-down effect
- FAB: Shadow reduces to simulate press

### Animation Principles

#### Timing Functions
```scss
Standard: cubic-bezier(0.25, 0.46, 0.45, 0.94)  // Smooth, natural
Spring: cubic-bezier(.92,-0.02,.86,2.28)        // Playful bounce
```

#### Animation Durations
- Micro-interactions: 150-200ms
- Page transitions: 500ms
- Complex animations: 500-900ms (larger screens get slower, more dramatic animations)

#### Core Animations

**Fade In**: Opacity 0 to 1 over 500ms
**Slide In**: Transform + opacity for directional entry
**Scale In**: Used for modals and important elements
**Jump In**: Playful entrance for toasts (combines position, scale, opacity)

### Gesture Support
- **Swipe**: Navigate between tabs on mobile
- **Pull to refresh**: Update content lists
- **Long press**: Access context menus

---

## Accessibility

### WCAG Compliance

#### Color Contrast
- Normal text: Minimum 4.5:1 ratio
- Large text: Minimum 3:1 ratio
- Interactive elements: Clear focus indicators

#### Keyboard Navigation
- All interactive elements accessible via keyboard
- Logical tab order following visual hierarchy
- Skip links for main content areas

#### Screen Reader Support
- Semantic HTML structure
- ARIA labels for complex interactions
- Live regions for dynamic content updates

### Inclusive Design Features

#### Reduced Motion
```scss
@media (prefers-reduced-motion: reduce) {
  // Animations become instant transitions
  // Decorative animations disabled
  // Essential feedback maintained
}
```

#### High Contrast Mode
Contrast variants available for all colors:
- Increased color saturation
- Stronger borders
- Enhanced shadows

#### Font Scaling
- Responsive units (rem) respect user preferences
- Layout adapts to larger text sizes
- No horizontal scrolling at 200% zoom

---

## Responsive Design

### Breakpoint Strategy

```scss
Mobile First Approach:
- Base: 0-600px (Mobile)
- Small: 600-768px (Large phones)
- Medium: 768-1024px (Tablets)
- Large: 1024-1440px (Desktop)
- XLarge: 1440px+ (Wide screens)
```

### Mobile Adaptations

#### Navigation
- Tab text hidden, icons only
- Hamburger menu for secondary navigation
- Bottom sheet pattern for modals

#### Content
- Single column layout
- Larger touch targets (minimum 44x44px)
- Simplified information density

#### Gestures
- Swipe navigation enabled
- Pull-to-refresh on lists
- Touch-friendly spacing

### Desktop Enhancements

#### Layout
- Multi-column grids where appropriate
- Side panels for additional context
- Persistent navigation

#### Interactions
- Hover states for additional information
- Keyboard shortcuts
- Drag-and-drop capabilities

---

## Practical Guidelines

### Component Selection Guide

#### When to Use Each Button Type
- **Primary**: One per screen, most important action
- **Secondary**: Supporting actions, alternatives
- **Text button**: Low-emphasis actions
- **FAB**: Primary creative action (mobile-first)

#### Card Variants
- **Statement Card**: User-generated content
- **Question Card**: Light blue tint for questions
- **Message Card**: Chat and conversation threads
- **Summary Card**: Aggregated information

### Best Practices

#### CSS/SCSS Guidelines

**Module Scoping - CRITICAL RULE**
```scss
// ❌ NEVER DO THIS
import './styles.scss';
import '../styles/global.scss';

// ✅ ALWAYS DO THIS
import styles from './Component.module.scss';
```

**Token Usage**
```scss
// ❌ WRONG
background-color: #5f88e5;

// ✅ CORRECT
background-color: var(--btn-primary);
```

#### Consistency Checklist
- [ ] Use design tokens, never hardcode colors
- [ ] Follow 8-point spacing grid
- [ ] Maintain type hierarchy
- [ ] Apply consistent border radius
- [ ] Use appropriate animation timing

#### Performance Considerations
- Implement skeleton screens for perceived performance
- Use CSS animations over JavaScript when possible
- Lazy load heavy components
- Optimize animation on mobile devices

### Common Pitfalls to Avoid

1. **Color Overload**: Limit palette usage per screen
2. **Animation Excess**: Purposeful animation only
3. **Inconsistent Spacing**: Always use spacing tokens
4. **Text Over Images**: Ensure readability with overlays
5. **Tiny Touch Targets**: Minimum 44x44px on mobile

### Implementation Examples

#### Creating a New Component
```scss
// Always use CSS modules
.myComponent {
  // Use design tokens
  background: var(--card-default);
  padding: var(--padding);
  border-radius: 8px;

  // Mobile-first responsive
  @media (min-width: 768px) {
    padding: calc(var(--padding) * 1.5);
  }
}
```

#### Applying Animation
```scss
.animatedElement {
  // Use standard timing function
  animation: fadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);

  // Respect user preferences
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

### Design Token Quick Reference

Always reference design tokens from the global styles:

```scss
// Primary Actions
var(--btn-primary)         // Primary button color
var(--btn-primary-hover)   // Primary button hover
var(--add-btn)             // Add/Create actions

// Semantic Colors
var(--agree)               // Positive/Agree
var(--disagree)            // Negative/Disagree
var(--text-error)          // Error states
var(--text-warning)        // Warning states

// Text Colors
var(--text-title)          // Headings
var(--text-body)           // Body text
var(--text-caption)        // Supporting text

// Backgrounds
var(--card-default)        // Card background
var(--statementBackground) // Page background

// Spacing
var(--padding)             // Standard padding
var(--radius)              // Standard border radius
```

---

## Evolution & Maintenance

### Design System Evolution
The Freedi design system evolves through user feedback and testing. New patterns should:
1. Solve a real user problem
2. Maintain consistency with existing patterns
3. Be accessible by default
4. Work across all supported devices

### Contributing to the Design System
When adding new components:
1. Check if existing components can be extended
2. Follow the established visual language
3. Document usage patterns
4. Include accessibility considerations
5. Test across breakpoints and color modes

### Testing Checklist

- [ ] Component works on mobile (< 768px)
- [ ] Component works on tablet (768px - 1440px)
- [ ] Component works on desktop (> 1440px)
- [ ] Hover states are visible
- [ ] Focus states are visible
- [ ] Disabled states are clear
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Contrast ratios meet WCAG AA
- [ ] Component works in RTL mode
- [ ] Component uses CSS modules (not global styles)
- [ ] All colors use CSS variables (no hardcoded hex)

### Future Considerations
The design system is built to accommodate:
- Dark mode implementation
- Enhanced personalization
- AR/VR interfaces
- Voice interaction patterns
- AI-assisted interfaces

---

## Quick Reference

### Color Quick Picks

| Purpose | Token | Hex | Usage |
|---------|-------|-----|-------|
| Primary action | `--btn-primary` | #5f88e5 | Main CTAs |
| Success/Agree | `--agree` | #57c6b2 | Positive actions |
| Error/Disagree | `--disagree` | #fe6ba2 | Negative actions |
| Warning | `--text-warning` | #ef7550 | Alerts |
| Question | `--question` | #47b4ef | Question type |
| Group | `--group` | #b893e7 | Group activities |
| Background | `--statementBackground` | #f2f6ff | Page bg |
| Card | `--card-default` | #ffffff | Card bg |

### Animation Quick Reference

| Effect | Class/Name | Duration | Usage |
|--------|------------|----------|-------|
| Slide from left | `.slide-in` | 0.5s | Page entry |
| Slide from right | `.slide-out` | 0.5s | Page entry |
| Zoom in | `.zoom-in` | 0.5s | Focus attention |
| Fade in | `.fade-in` | 0.5s | Gentle appearance |
| Modal entrance | `rise` | 0.4s | Modal/sheet |
| Toast entrance | `jumpIn` | 1s | Notifications |
| Dot pulse | `dotPulse` | 1.5s | Loading states |

### Spacing Quick Reference

| Size | Value | Usage |
|------|-------|-------|
| Tiny | `0.25rem` | Between related elements |
| Small | `0.5rem` | Within components |
| Default | `1rem` | Standard spacing |
| Medium | `1.5rem` | Between sections |
| Large | `2rem` | Major sections |

---

## Conclusion

The Freedi design system creates a cohesive, intuitive experience that empowers collaborative decision-making. By maintaining consistency, prioritizing accessibility, and focusing on user needs, we ensure that the interface never stands between users and their collective goals.

Remember: **The best interface is invisible** - it guides without commanding, supports without overwhelming, and empowers without complicating.

---

*Last Updated: October 2025*
*Version: 2.0.0*