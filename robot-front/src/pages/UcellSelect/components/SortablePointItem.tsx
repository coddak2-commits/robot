import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PointItem, PointItemProps } from './PointItem';

type SortablePointItemProps = Omit<PointItemProps, 'isDraggable' | 'dragHandleProps'>;
export function SortablePointItem(props: SortablePointItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.point.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PointItem
        {...props}
        isDraggable={true}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
export const SortablePointItem_SortablePointItem = SortablePointItem;
