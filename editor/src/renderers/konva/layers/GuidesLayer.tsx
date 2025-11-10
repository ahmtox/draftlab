import React from 'react';
import { Layer, Line, Circle, Text } from 'react-konva';
import { memo } from 'react';
import type { SnapCandidate } from '../../../core/geometry/snapping';
import { worldToScreen } from '../viewport';
import { useStore } from '../../../state/store';

interface GuidesLayerProps {
  snapCandidates: (SnapCandidate | null)[];
}

function GuidesLayerComponent({ snapCandidates }: GuidesLayerProps) {
  const viewport = useStore((state) => state.viewport);

  // Filter out null candidates
  const validCandidates = snapCandidates.filter((c): c is SnapCandidate => c !== null);

  if (validCandidates.length === 0) return <Layer listening={false} />;

  // Choose color based on snap type
  const getSnapColor = (type: string): string => {
    switch (type) {
      case 'node': return '#3b82f6'; // blue
      case 'grid': return '#10b981'; // green
      case 'edge': return '#f59e0b'; // amber
      case 'midpoint': return '#8b5cf6'; // purple
      default: return '#6b7280'; // gray
    }
  };

  // Snap indicator circle
  const indicatorRadius = 8;

  // Crosshair lines
  const crosshairSize = 12;

  return (
    <Layer listening={false}>
      {validCandidates.map((snapCandidate, index) => {
        const snapPointScreen = worldToScreen(snapCandidate.point, viewport);
        const color = getSnapColor(snapCandidate.type);

        return (
          <React.Fragment key={`snap-${index}`}>
            {/* Crosshair */}
            <Line
              points={[
                snapPointScreen.x - crosshairSize, snapPointScreen.y,
                snapPointScreen.x + crosshairSize, snapPointScreen.y,
              ]}
              stroke={color}
              strokeWidth={1.5}
              listening={false}
            />
            <Line
              points={[
                snapPointScreen.x, snapPointScreen.y - crosshairSize,
                snapPointScreen.x, snapPointScreen.y + crosshairSize,
              ]}
              stroke={color}
              strokeWidth={1.5}
              listening={false}
            />

            {/* Snap indicator circle */}
            <Circle
              x={snapPointScreen.x}
              y={snapPointScreen.y}
              radius={indicatorRadius}
              stroke={color}
              strokeWidth={2}
              listening={false}
            />

            {/* Label */}
            <Text
              x={snapPointScreen.x + 12}
              y={snapPointScreen.y - 8}
              text={snapCandidate.type}
              fontSize={11}
              fill={color}
              listening={false}
            />
          </React.Fragment>
        );
      })}
    </Layer>
  );
}

export const GuidesLayer = memo(GuidesLayerComponent);