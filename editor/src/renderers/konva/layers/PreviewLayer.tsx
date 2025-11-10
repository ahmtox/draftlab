import { Layer, Line, Circle } from 'react-konva';
import { memo } from 'react';
import { useStore } from '../../../state/store';
import { worldToScreen } from '../viewport';
import { PREVIEW_NODE_RADIUS_MM } from '../../../core/constants';
import * as vec from '../../../core/math/vec';
import type { Vec2 } from '../../../core/math/vec';

interface PreviewLayerProps {
  previewWall: {
    startMm: { x: number; y: number };
    endMm: { x: number; y: number };
  } | null;
  hoverPoint: Vec2 | null; // Hover indicator before first click
}

function PreviewLayerComponent({ previewWall, hoverPoint }: PreviewLayerProps) {
  const viewport = useStore((state) => state.viewport);
  const wallParams = useStore((state) => state.wallParams);

  // Calculate preview node radius in screen pixels (world mm * scale)
  const previewNodeRadiusPx = PREVIEW_NODE_RADIUS_MM * viewport.scale;

  return (
    <Layer listening={false}>
      {/* Hover indicator - shown before first click when in wall tool */}
      {hoverPoint && !previewWall && (
        <>
          {/* Pulsing circle to indicate start point */}
          <Circle
            x={worldToScreen(hoverPoint, viewport).x}
            y={worldToScreen(hoverPoint, viewport).y}
            radius={previewNodeRadiusPx * 1.5}
            fill="rgba(59, 130, 246, 0.2)"
            listening={false}
          />
          <Circle
            x={worldToScreen(hoverPoint, viewport).x}
            y={worldToScreen(hoverPoint, viewport).y}
            radius={previewNodeRadiusPx}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
            listening={false}
          />
        </>
      )}

      {/* Preview wall - shown after first click */}
      {previewWall && (() => {
        const start = worldToScreen(previewWall.startMm, viewport);
        const end = worldToScreen(previewWall.endMm, viewport);

        // Calculate perpendicular for thickness
        const dir = vec.normalize(vec.sub(previewWall.endMm, previewWall.startMm));
        const perp = vec.perpendicular(dir);
        const halfThickness = wallParams.thicknessMm / 2;

        // Offset edges in world space, then convert to screen
        const startLeft = worldToScreen(vec.add(previewWall.startMm, vec.scale(perp, halfThickness)), viewport);
        const startRight = worldToScreen(vec.sub(previewWall.startMm, vec.scale(perp, halfThickness)), viewport);
        const endLeft = worldToScreen(vec.add(previewWall.endMm, vec.scale(perp, halfThickness)), viewport);
        const endRight = worldToScreen(vec.sub(previewWall.endMm, vec.scale(perp, halfThickness)), viewport);

        const polygon = [
          startLeft.x, startLeft.y,
          endLeft.x, endLeft.y,
          endRight.x, endRight.y,
          startRight.x, startRight.y,
        ];

        return (
          <>
            {/* Preview wall polygon */}
            <Line
              points={polygon}
              closed
              fill="rgba(59, 130, 246, 0.3)"
              stroke="#3b82f6"
              strokeWidth={2}
              dash={[10, 5]}
              listening={false}
            />
            
            {/* Centerline */}
            <Line
              points={[start.x, start.y, end.x, end.y]}
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[5, 5]}
              listening={false}
            />
            
            {/* Start node */}
            <Circle
              x={start.x}
              y={start.y}
              radius={previewNodeRadiusPx}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth={2}
              listening={false}
            />
            
            {/* End node */}
            <Circle
              x={end.x}
              y={end.y}
              radius={previewNodeRadiusPx}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth={2}
              listening={false}
            />
          </>
        );
      })()}
    </Layer>
  );
}

export const PreviewLayer = memo(PreviewLayerComponent);