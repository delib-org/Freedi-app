# SVG Bundle Migration Guide

## Overview

This guide helps migrate from individual SVG imports to the new bundled icon system, reducing HTTP requests from 100+ to just a few.

## Before (Individual SVG Imports)

```tsx
import DeleteIcon from '@/assets/icons/delete.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import EditIcon from '@/assets/icons/editIcon.svg?react';

function MyComponent() {
	return (
		<div>
			<DeleteIcon />
			<PlusIcon />
			<EditIcon />
		</div>
	);
}
```

## After (Bundled Icons)

```tsx
import { Icon } from '@/view/components/icons';

function MyComponent() {
	return (
		<div>
			<Icon name='delete' />
			<Icon name='plus' />
			<Icon name='edit' />
		</div>
	);
}
```

## Icon Component API

### Basic Usage

```tsx
<Icon name='delete' />
```

### With Props

```tsx
<Icon
	name='delete'
	size={24}
	color='#ff0000'
	className='my-icon'
	onClick={() => handleDelete()}
/>
```

### Available Props

- `name: string` - Icon name (required)
- `size?: number | string` - Icon size (default: 24)
- `color?: string` - Icon color (default: 'currentColor')
- `className?: string` - Additional CSS classes
- `onClick?: () => void` - Click handler
- `style?: React.CSSProperties` - Inline styles
- `fallbackToOriginal?: boolean` - Use original SVG if not in bundle

## Bundled Icons (Most Common)

The following icons are included in the main bundle for optimal performance:

### Core Actions

- `delete` - Delete/trash icon
- `plus` - Add/plus icon
- `edit` - Edit/pencil icon
- `save` - Save icon
- `share` - Share icon
- `send` - Send icon

### Navigation

- `home` - Home icon
- `chevronLeft` - Left arrow
- `chevronRight` - Right arrow
- `view` - Eye/view icon
- `map` - Map icon

### UI Elements

- `x` - Close/X icon
- `ellipsis` - More options (three dots)
- `burger` - Hamburger menu
- `settings` - Settings/gear icon
- `check` - Checkmark icon
- `info` - Information icon

### Communication

- `hand` - Hand/voting icon
- `lightBulb` - Ideas/suggestions icon
- `question` - Question mark icon
- `group` - Group/people icon
- `notification` - Bell icon
- `mail` - Email icon

### Emotions

- `smile` - Happy/smile icon
- `frown` - Sad/frown icon
- `like` - Thumbs up icon

### System

- `target` - Target/focus icon
- `disconnect` - Disconnect icon
- `language` - Language/globe icon
- `install` - Download/install icon

## Migration Examples

### Example 1: Simple Icon Replace

```tsx
// Before
import DeleteIcon from '@/assets/icons/delete.svg?react';
<DeleteIcon />;

// After
import { Icon } from '@/view/components/icons';
<Icon name='delete' />;
```

### Example 2: Icon with Click Handler

```tsx
// Before
import DeleteIcon from '@/assets/icons/delete.svg?react';
<button onClick={handleDelete}>
	<DeleteIcon />
</button>;

// After
import { Icon } from '@/view/components/icons';
<Icon name='delete' onClick={handleDelete} />;
```

### Example 3: Styled Icon

```tsx
// Before
import DeleteIcon from '@/assets/icons/delete.svg?react';
<DeleteIcon style={{ color: 'red', width: 32, height: 32 }} />;

// After
import { Icon } from '@/view/components/icons';
<Icon name='delete' color='red' size={32} />;
```

### Example 4: Icon Not in Bundle (Fallback)

```tsx
// For icons not in the main bundle, use fallbackToOriginal
import { Icon } from '@/view/components/icons';
<Icon name='rareIcon' fallbackToOriginal={true} />;
```

## Performance Benefits

### Before Migration

- **140 SVG files** in assets/icons/
- **100+ individual HTTP requests** for SVG imports
- **Each component import** triggers separate network request
- **Slower initial page load** due to request waterfall

### After Migration

- **30+ most common icons** bundled inline (0 requests)
- **~10 additional icons** lazy loaded as needed
- **90%+ reduction** in SVG-related HTTP requests
- **Faster page loads** and improved development experience

## Advanced Usage

### Custom Icon Component

```tsx
import { Icon } from '@/view/components/icons';

function DeleteButton({ onDelete }: { onDelete: () => void }) {
	return (
		<button className='delete-btn' onClick={onDelete}>
			<Icon name='delete' color='white' size={16} />
			Delete
		</button>
	);
}
```

### Conditional Icons

```tsx
function StatusIcon({ status }: { status: 'success' | 'error' | 'info' }) {
	const iconName = {
		success: 'check',
		error: 'x',
		info: 'info',
	}[status];

	return <Icon name={iconName} />;
}
```

## Migration Checklist

1. ✅ **Install Icon System** - Components created in `/src/view/components/icons/`
2. ⏳ **Update Most Common Icons** - Start with delete, plus, edit, hand, lightBulb
3. ⏳ **Test Icon Rendering** - Verify icons display correctly
4. ⏳ **Update Click Handlers** - Migrate button wrappers to onClick prop
5. ⏳ **Remove Individual Imports** - Clean up old SVG imports
6. ⏳ **Test Performance** - Measure request reduction
7. ⏳ **Handle Edge Cases** - Use fallbackToOriginal for uncommon icons

## Next Steps

1. **Start with high-frequency icons** (delete, plus, edit)
2. **Test in development** to verify functionality
3. **Measure request reduction** in browser dev tools
4. **Gradually migrate remaining icons** as needed
5. **Monitor bundle size** vs request count trade-offs
