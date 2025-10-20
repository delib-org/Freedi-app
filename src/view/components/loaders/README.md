# Loaders Documentation

## SuggestionLoader

An improved loader component designed specifically for when users submit suggestions and the system searches for similar ideas.

### Features

- **Progressive messaging**: Shows different messages as the search progresses
- **Visual feedback**: Animated icons, progress bar, and step indicators
- **Two variants**: Modern (default) and Minimal
- **Accessible**: Includes proper ARIA attributes and respects prefers-reduced-motion
- **Internationalized**: All messages use the translation system

### Usage

```tsx
import SuggestionLoader from '@/view/components/loaders/SuggestionLoader';

// Basic usage with default modern variant
<SuggestionLoader show={isLoading} />

// Minimal variant for simpler interface
<SuggestionLoader show={isLoading} variant="minimal" />

// Custom messages
<SuggestionLoader
  show={isLoading}
  messages={[
    "Processing your input...",
    "Analyzing content...",
    "Almost done..."
  ]}
  messageInterval={3000} // Change message every 3 seconds
/>
```

### Props

- `show` (boolean, required): Controls visibility of the loader
- `variant` ('modern' | 'minimal', optional): Visual style variant
- `messages` (string[], optional): Custom messages to display
- `messageInterval` (number, optional): Time between message changes in milliseconds (default: 2500)

### Variants

#### Modern (Default)
- Full-featured with icons, progress bar, and step indicators
- Best for important actions where users need detailed feedback
- Includes animated emoji icons for each step

#### Minimal
- Simple spinner with rotating messages
- Best for quick operations or when space is limited
- Cleaner look for users who prefer less visual complexity

### Customization

The loader uses CSS variables from the global theme:
- `--btn-primary`: Primary color for progress bar and active indicators
- `--btn-primary-hover`: Hover/glow effects
- `--card-default`: Background color for modern variant container
- `--surface-background`: Inactive indicator colors
- `--text-title`, `--text-caption`: Text colors

### Accessibility

- Includes `role="status"` and `aria-live="polite"` for screen readers
- Respects `prefers-reduced-motion` setting
- Clear, descriptive messages for all users

## Other Available Loaders

### Loader (Default spinner)
Basic rotating circle loader with blue/orange animation.

### LoaderGlass
Hourglass-style animated loader with liquid effect.

### BouncingLoader
Bouncing dots loader with spreading animation.

### PeopleLoader
Specialized loader showing people icons (for member-related operations).