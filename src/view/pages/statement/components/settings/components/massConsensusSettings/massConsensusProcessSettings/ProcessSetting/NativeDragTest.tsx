import React, { useState } from 'react';

export default function NativeDragTest() {
  const [items, setItems] = useState(['Item 1', 'Item 2', 'Item 3']);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedOver, setDraggedOver] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, item: string) => {
    console.info('Native drag start:', item);
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, item: string) => {
    console.info('Drag enter:', item);
    setDraggedOver(item);
  };

  const handleDrop = (e: React.DragEvent, dropTarget: string) => {
    e.preventDefault();
    console.info('Drop:', draggedItem, 'onto', dropTarget);

    if (draggedItem && draggedItem !== dropTarget) {
      const newItems = [...items];
      const draggedIndex = newItems.indexOf(draggedItem);
      const targetIndex = newItems.indexOf(dropTarget);

      // Remove dragged item
      newItems.splice(draggedIndex, 1);
      // Insert at new position
      newItems.splice(targetIndex, 0, draggedItem);

      setItems(newItems);
    }

    setDraggedItem(null);
    setDraggedOver(null);
  };

  const handleDragEnd = () => {
    console.info('Drag end');
    setDraggedItem(null);
    setDraggedOver(null);
  };

  return (
    <div style={{ padding: '20px', background: '#f5f5f5', borderRadius: '8px', marginBottom: '20px' }}>
      <h3>Native HTML5 Drag Test</h3>
      <p>This uses native HTML5 drag API - try dragging items:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item) => (
          <div
            key={item}
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, item)}
            onDrop={(e) => handleDrop(e, item)}
            onDragEnd={handleDragEnd}
            style={{
              padding: '12px',
              background: draggedItem === item ? '#ccc' : draggedOver === item ? '#e0e0e0' : 'white',
              border: '2px solid #ddd',
              borderRadius: '4px',
              cursor: 'move',
              opacity: draggedItem === item ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            {item} {draggedItem === item && '(Dragging)'}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
        Status: {draggedItem ? `Dragging ${draggedItem}` : 'Ready'}
      </div>
    </div>
  );
}