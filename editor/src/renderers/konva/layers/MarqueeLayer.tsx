import { Layer, Rect } from 'react-konva';
import { memo } from 'react';

interface MarqueeLayerProps {
  marqueeStart: { x: number; y: number } | null;
  marqueeCurrent: { x: number; y: number } | null;
}

function MarqueeLayerComponent({ marqueeStart, marqueeCurrent }: MarqueeLayerProps) {
  if (!marqueeStart || !marqueeCurrent) return <Layer listening={false} />;

  const x = Math.min(marqueeStart.x, marqueeCurrent.x);
  const y = Math.min(marqueeStart.y, marqueeCurrent.y);
  const width = Math.abs(marqueeCurrent.x - marqueeStart.x);
  const height = Math.abs(marqueeCurrent.y - marqueeStart.y);

  return (
    <Layer listening={false}>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(59, 130, 246, 0.1)"
        stroke="#3b82f6"
        strokeWidth={1}
        dash={[5, 5]}
        listening={false}
      />
    </Layer>
  );
}

export const MarqueeLayer = memo(MarqueeLayerComponent);