import { useState, DragEvent } from 'react';
import { Statement } from '@freedi/shared-types';
import { updateStatementsOrderToDB } from '@/controllers/db/statements/setStatements';
import { useDispatch } from 'react-redux';
import { setStatements } from '@/redux/statements/statementsSlice';

interface DraggedItem {
	index: number;
	indexOffset: number;
	y: number;
}

interface UseDragAndDropProps {
	stages: Statement[];
}

interface UseDragAndDropReturn {
	draggedIndex: number | null;
	draggedItem: DraggedItem | null;
	handleDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
	handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
	handleDrop: (e: DragEvent<HTMLDivElement>, dropIndex: number) => void;
	handleDragEnd: () => void;
}

export const useDragAndDrop = ({ stages }: UseDragAndDropProps): UseDragAndDropReturn => {
	const dispatch = useDispatch();
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);

	const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number): void => {
		setDraggedIndex(index);
		const topOfTarget = e.currentTarget.getBoundingClientRect().top;
		setDraggedItem({
			index,
			indexOffset: e.clientY - topOfTarget,
			y: topOfTarget,
		});
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
		e.preventDefault();
		if (draggedItem) {
			setDraggedItem((prev) => (prev ? { ...prev, y: e.clientY - draggedItem.indexOffset } : null));
		}
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>, dropIndex: number): void => {
		e.preventDefault();
		if (draggedIndex === null || draggedIndex === dropIndex) return;

		const newStages = [...stages];
		const draggedStage = newStages[draggedIndex];
		newStages.splice(draggedIndex, 1);
		newStages.splice(dropIndex, 0, draggedStage);

		// Update order property for each stage
		newStages.forEach((stage, index) => {
			stage.order = index;
		});

		// Update in database
		updateStatementsOrderToDB(newStages);

		// Update in Redux store
		dispatch(setStatements(newStages));
	};

	const handleDragEnd = (): void => {
		setDraggedItem(null);
		setDraggedIndex(null);
	};

	return {
		draggedIndex,
		draggedItem,
		handleDragStart,
		handleDragOver,
		handleDrop,
		handleDragEnd,
	};
};
