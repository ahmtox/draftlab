import type { Vec2 } from '../../core/math/vec';
import { MIN_MARQUEE_SIZE_PX } from './types';

export function getMarqueeBox(
  marqueeStart: Vec2 | null,
  marqueeCurrent: Vec2 | null
): { x: number; y: number; width: number; height: number } | null {
  if (!marqueeStart || !marqueeCurrent) return null;

  const x = Math.min(marqueeStart.x, marqueeCurrent.x);
  const y = Math.min(marqueeStart.y, marqueeCurrent.y);
  const width = Math.abs(marqueeCurrent.x - marqueeStart.x);
  const height = Math.abs(marqueeCurrent.y - marqueeStart.y);

  if (width < MIN_MARQUEE_SIZE_PX || height < MIN_MARQUEE_SIZE_PX) {
    return null;
  }

  return { x, y, width, height };
}

export function isPointInBox(
  point: Vec2,
  box: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

export function lineSegmentIntersectsRect(
  a: Vec2,
  b: Vec2,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const rectLeft = rect.x;
  const rectRight = rect.x + rect.width;
  const rectTop = rect.y;
  const rectBottom = rect.y + rect.height;

  const lineSegmentIntersectsLine = (
    p1: Vec2,
    p2: Vec2,
    p3: Vec2,
    p4: Vec2
  ): boolean => {
    const denominator =
      (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denominator) < 1e-10) return false;

    const ua =
      ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) /
      denominator;
    const ub =
      ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) /
      denominator;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  };

  const topLeft = { x: rectLeft, y: rectTop };
  const topRight = { x: rectRight, y: rectTop };
  const bottomLeft = { x: rectLeft, y: rectBottom };
  const bottomRight = { x: rectRight, y: rectBottom };

  return (
    lineSegmentIntersectsLine(a, b, topLeft, topRight) ||
    lineSegmentIntersectsLine(a, b, topRight, bottomRight) ||
    lineSegmentIntersectsLine(a, b, bottomRight, bottomLeft) ||
    lineSegmentIntersectsLine(a, b, bottomLeft, topLeft)
  );
}