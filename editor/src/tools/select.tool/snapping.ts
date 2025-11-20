import type { Vec2 } from '../../core/math/vec';
import type { SnapCandidate } from '../../core/geometry/snapping';
import * as vec from '../../core/math/vec';
import {
  RIGID_BODY_SNAP_TOLERANCE_MM,
  SAME_POSITION_TOLERANCE_MM,
} from './types';

export function filterSnapCandidatesForDisplay(
  candidates: SnapCandidate[]
): SnapCandidate[] {
  if (candidates.length === 0) return [];

  const positionGroups: SnapCandidate[][] = [];

  for (const candidate of candidates) {
    let foundGroup = false;

    for (const group of positionGroups) {
      const groupPosition = group[0].point;
      const distance = vec.distance(candidate.point, groupPosition);

      if (distance < SAME_POSITION_TOLERANCE_MM) {
        group.push(candidate);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      positionGroups.push([candidate]);
    }
  }

  const filtered: SnapCandidate[] = [];

  for (const group of positionGroups) {
    group.sort((a, b) => b.priority - a.priority);

    const best = group[0];
    filtered.push(best);

    if (best.type === 'guideline-intersection' && best.guidelines) {
      for (const guideline of best.guidelines) {
        filtered.push({
          point: best.point,
          type: 'guideline',
          entityId: `__visual_only__${guideline.nodeId}`,
          priority: 4,
          distancePx: best.distancePx,
          guideline: guideline,
        });
      }
    }
  }

  return filtered;
}

export function findRigidBodySnapDelta(
  originalPositions: Map<string, Vec2>,
  baseDelta: Vec2,
  snapTargets: Map<string, { snapPoint: Vec2; candidate: SnapCandidate }[]>
): {
  delta: Vec2;
  snappedNodes: Map<string, { snapPoint: Vec2; candidate: SnapCandidate }>;
} | null {
  const candidateDeltas: Array<{
    delta: Vec2;
    nodeId: string;
    snapPoint: Vec2;
    candidate: SnapCandidate;
  }> = [];

  for (const [nodeId, targets] of snapTargets) {
    const originalPos = originalPositions.get(nodeId)!;

    for (const target of targets) {
      const snapDelta = vec.sub(target.snapPoint, originalPos);
      candidateDeltas.push({
        delta: snapDelta,
        nodeId,
        snapPoint: target.snapPoint,
        candidate: target.candidate,
      });
    }
  }

  candidateDeltas.sort((a, b) => b.candidate.priority - a.candidate.priority);

  for (const candidate of candidateDeltas) {
    const testDelta = candidate.delta;

    if (validateRigidBodyDelta(originalPositions, testDelta)) {
      const snappedNodes = new Map<
        string,
        { snapPoint: Vec2; candidate: SnapCandidate }
      >();
      snappedNodes.set(candidate.nodeId, {
        snapPoint: candidate.snapPoint,
        candidate: candidate.candidate,
      });

      for (const [otherNodeId, targets] of snapTargets) {
        if (otherNodeId === candidate.nodeId) continue;

        const otherOriginalPos = originalPositions.get(otherNodeId)!;
        const otherFinalPos = vec.add(otherOriginalPos, testDelta);

        for (const target of targets) {
          const distanceToSnap = vec.distance(otherFinalPos, target.snapPoint);
          if (distanceToSnap < RIGID_BODY_SNAP_TOLERANCE_MM) {
            snappedNodes.set(otherNodeId, {
              snapPoint: target.snapPoint,
              candidate: target.candidate,
            });
            break;
          }
        }
      }

      return { delta: testDelta, snappedNodes };
    }
  }

  return null;
}

export function validateRigidBodyDelta(
  originalPositions: Map<string, Vec2>,
  delta: Vec2
): boolean {
  const nodeIds = Array.from(originalPositions.keys());

  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const nodeAId = nodeIds[i];
      const nodeBId = nodeIds[j];

      const originalA = originalPositions.get(nodeAId)!;
      const originalB = originalPositions.get(nodeBId)!;
      const originalDistance = vec.distance(originalA, originalB);

      const translatedA = vec.add(originalA, delta);
      const translatedB = vec.add(originalB, delta);
      const translatedDistance = vec.distance(translatedA, translatedB);

      const distanceDeviation = Math.abs(
        translatedDistance - originalDistance
      );

      if (distanceDeviation > RIGID_BODY_SNAP_TOLERANCE_MM) {
        return false;
      }
    }
  }

  return true;
}