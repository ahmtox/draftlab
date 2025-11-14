import React from 'react';
import { Layer, Line, Circle, Text } from 'react-konva';
import { memo } from 'react';
import type { SnapCandidate } from '../../../core/geometry/snapping';
import { worldToScreen, screenToWorld } from '../viewport';
import { useStore } from '../../../state/store';
import { getGuidelineVisibleBounds } from '../../../core/geometry/guides';

interface GuidesLayerProps {
  snapCandidates: (SnapCandidate | null)[];
}

function GuidesLayerComponent({ snapCandidates }: GuidesLayerProps) {
  const viewport = useStore((state) => state.viewport);

  // Filter out null candidates
  const validCandidates = snapCandidates.filter((c): c is SnapCandidate => c !== null);

  // Choose color based on snap type
  const getSnapColor = (type: string): string => {
    switch (type) {
      case 'node': return '#3b82f6'; // blue
      case 'grid': return '#10b981'; // green
      case 'edge': return '#f59e0b'; // amber
      case 'midpoint': return '#8b5cf6'; // purple
      case 'angle': return '#ef4444'; // red
      case 'guideline': return '#ec4899'; // pink
      case 'guideline-intersection': return '#ec4899'; // pink (same as guideline)
      default: return '#6b7280'; // gray
    }
  };

  // Snap indicator circle
  const indicatorRadius = 8;

  // Crosshair lines
  const crosshairSize = 12;

  // Compute viewport bounds in world coordinates for guideline rendering
  const viewportBounds = React.useMemo(() => {
    const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
    const bottomRight = screenToWorld(
      { x: window.innerWidth, y: window.innerHeight },
      viewport
    );

    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      maxX: Math.max(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }, [viewport]);

  // Extract guideline candidates (both single and intersections)
  const guidelineCandidates = validCandidates.filter(c => 
    (c.type === 'guideline' && c.guideline) || 
    (c.type === 'guideline-intersection' && c.guidelines)
  );

  // Collect all unique guidelines to render
  const allGuidelines = React.useMemo(() => {
    const guidelines = new Map<string, any>();
    
    for (const candidate of guidelineCandidates) {
      if (candidate.type === 'guideline' && candidate.guideline) {
        const key = `${candidate.guideline.type}-${candidate.guideline.value}`;
        guidelines.set(key, candidate.guideline);
      } else if (candidate.type === 'guideline-intersection' && candidate.guidelines) {
        for (const guideline of candidate.guidelines) {
          const key = `${guideline.type}-${guideline.value}`;
          guidelines.set(key, guideline);
        }
      }
    }
    
    return Array.from(guidelines.values());
  }, [guidelineCandidates]);

  return (
    <Layer listening={false}>
      {/* Render guidelines (dashed pink lines) */}
      {allGuidelines.map((guideline, index) => {
        const bounds = getGuidelineVisibleBounds(guideline, viewportBounds);
        if (!bounds) return null;

        const startScreen = worldToScreen(bounds.start, viewport);
        const endScreen = worldToScreen(bounds.end, viewport);

        return (
          <Line
            key={`guideline-${index}`}
            points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
            stroke="#ec4899"
            strokeWidth={1}
            dash={[8, 4]}
            listening={false}
            opacity={0.6}
          />
        );
      })}

      {/* Render snap indicators */}
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
              text={snapCandidate.type === 'guideline-intersection' ? 'intersection' : snapCandidate.type}
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