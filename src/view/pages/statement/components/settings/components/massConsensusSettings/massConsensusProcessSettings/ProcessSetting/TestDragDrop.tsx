import React from 'react';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id }: { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '16px',
    margin: '8px',
    backgroundColor: isDragging ? '#e0e0e0' : '#f0f0f0',
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none' as const,
  };

  // Log to verify listeners are attached
  React.useEffect(() => {
    console.info(`Item ${id} listeners:`, listeners);
  }, [id, listeners]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => {
        console.info(`MouseDown on item ${id}`);
        if (listeners?.onMouseDown) {
          listeners.onMouseDown(e as React.MouseEvent);
        }
      }}
      onPointerDown={(e) => {
        console.info(`PointerDown on item ${id}`);
        if (listeners?.onPointerDown) {
          listeners.onPointerDown(e as React.PointerEvent);
        }
      }}
    >
      Item {id} - {isDragging ? 'Dragging' : 'Ready'}
    </div>
  );
}

export default function TestDragDrop() {
  const [items, setItems] = React.useState(['1', '2', '3']);

  // Try different sensor configurations
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 0, // Start dragging immediately
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 0,
        tolerance: 0,
      },
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 0,
      },
    })
  );

  const handleDragStart = (event: { active: { id: unknown } }) => {
    console.info('Drag Start:', event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    console.info('Drag End:', event);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        
return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div style={{ padding: '20px', isolation: 'isolate' }}>
      <h3>Test Drag and Drop</h3>
      <p>Try dragging the items below:</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items}
          strategy={verticalListSortingStrategy}
        >
          {items.map(id => (
            <SortableItem key={id} id={id} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}