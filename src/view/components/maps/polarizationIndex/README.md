# Polarization Index Component - Refactored

This directory contains a refactored and modularized version of the PolarizationIndex component, broken down into smaller, more manageable pieces.

## Structure

```
polarizationIndex/
├── PolarizationIndex.tsx              # Original monolithic component
├── PolarizationIndexRefactored.tsx    # New refactored main component
├── PolarizationIndex.module.scss      # Styles (unchanged)
├── components/                         # UI Components
│   ├── index.ts                       # Component exports
│   ├── LoadingStates.tsx              # Loading and no-data states
│   ├── StatementSelector.tsx          # Statement selection UI
│   ├── AxisSelector.tsx               # Axis selection UI
│   ├── PolarizationChart.tsx          # Canvas chart component
│   ├── StatsPanel.tsx                 # Statistics display
│   ├── GroupDetails.tsx               # Selected group details
│   ├── GroupsList.tsx                 # Groups listing
│   ├── AllStatementsOverview.tsx      # All statements summary
│   └── Instructions.tsx               # Usage instructions
├── hooks/                             # Custom hooks
│   ├── index.ts                       # Hook exports
│   ├── usePolarizationData.ts         # Data fetching and state management
│   ├── useResponsiveDimensions.ts     # Responsive canvas sizing
│   └── useCanvasInteractions.ts       # Canvas click handling
└── utils/                             # Utility functions
    ├── index.ts                       # Utility exports
    └── canvasUtils.ts                 # Canvas coordinate transformations
```

## Components

### Core Components

- **PolarizationIndexRefactored.tsx**: Main orchestrating component that brings everything together
- **PolarizationChart.tsx**: Handles all canvas drawing logic for the chart
- **LoadingStates.tsx**: Loading and no-data state components

### UI Components

- **StatementSelector.tsx**: Interactive statement selection buttons
- **AxisSelector.tsx**: Grouping axis selection buttons
- **StatsPanel.tsx**: Displays metrics for selected statement and axis
- **GroupDetails.tsx**: Shows detailed information for selected group
- **GroupsList.tsx**: Grid of groups in current axis
- **AllStatementsOverview.tsx**: Summary cards for all statements
- **Instructions.tsx**: Usage instructions

## Custom Hooks

### usePolarizationData

Manages all data fetching, loading states, and selection state:

- Fetches data from Redux store
- Handles database subscriptions
- Manages selected statement, axis, and group indices
- Provides computed values like current axis and selected group data

### useResponsiveDimensions

Handles responsive canvas sizing:

- Tracks container dimensions
- Provides container ref for measurement
- Automatically updates on window resize

### useCanvasInteractions

Manages canvas click interactions:

- Detects clicks on statement points
- Detects clicks on group points
- Handles selection state updates
- Uses canvas coordinate transformation utilities

## Utilities

### canvasUtils.ts

- **dataToCanvas**: Transforms data coordinates to canvas coordinates
- **generateTriangleBoundary**: Generates triangle boundary points for the chart

## Benefits of Refactoring

1. **Separation of Concerns**: Each component has a single, clear responsibility
2. **Reusability**: Components can be reused or replaced independently
3. **Testability**: Smaller components are easier to unit test
4. **Maintainability**: Easier to locate and modify specific functionality
5. **Readability**: Smaller files are easier to understand and navigate
6. **Type Safety**: Better TypeScript support with explicit interfaces

## Usage

To use the refactored component, simply import it:

```tsx
import PolarizationIndex from './PolarizationIndexRefactored';

// Use exactly like the original component
<PolarizationIndex />;
```

The refactored component maintains the same external API as the original, so it's a drop-in replacement.

## Migration

To migrate from the original component:

1. Replace the import:

    ```tsx
    // Before
    import PolarizationIndex from './PolarizationIndex';

    // After
    import PolarizationIndex from './PolarizationIndexRefactored';
    ```

2. The component interface remains the same, so no other changes are needed.

3. Once tested, you can rename `PolarizationIndexRefactored.tsx` to `PolarizationIndex.tsx` and remove the original file.
