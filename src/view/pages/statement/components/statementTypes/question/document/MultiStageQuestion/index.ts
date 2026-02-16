export { default } from './MultiStageQuestion';

// Export hooks for potential reuse
export { useDragAndDrop } from './hooks/useDragAndDrop';
export { useStageManagement } from './hooks/useStageManagement';

// Export section components
export { IntroductionSection } from './sections/IntroductionSection';
export { QuestionsSection } from './sections/QuestionsSection';
export { SolutionsSection } from './sections/SolutionsSection';
export { EmptyStateSection } from './sections/EmptyStateSection';

// Export other components
export { StageModals } from './components/StageModals';
export { DragGhostItem } from './components/DragGhostItem';
