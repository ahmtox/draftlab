import { Stage as KonvaStage } from 'react-konva';
import { useCallback, useRef, useEffect, useState } from 'react';
import { GridLayer } from './layers/GridLayer';
import { WallsLayer } from './layers/WallsLayer';
import { PreviewLayer } from './layers/PreviewLayer';
import { GuidesLayer } from './layers/GuidesLayer';
import { useStore } from '../../state/store';
import { MIN_ZOOM_SCALE, MAX_ZOOM_SCALE, MIN_WALL_LENGTH_MM, NODE_RADIUS_MM } from '../../core/constants';
import { screenToWorld, worldToScreen } from './viewport';
import { findSnapCandidate, type SnapCandidate } from '../../core/geometry/snapping';
import { hitTestWalls, hitTestWallNode, getConnectedWalls } from '../../core/geometry/hit-testing';
import { findNodeAtPosition, mergeNodes } from '../../core/geometry/node-merging';
import * as vec from '../../core/math/vec';
import type { Vec2 } from '../../core/math/vec';

type WallToolState = 'idle' | 'first-point' | 'dragging';
type SelectToolState = 'idle' | 'dragging';

export function Stage() {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const activeTool = useStore((state) => state.activeTool);
  const wallParams = useStore((state) => state.wallParams);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  const selectedWallId = useStore((state) => state.selectedWallId);
  const setSelectedWallId = useStore((state) => state.setSelectedWallId);
  const hoveredWallId = useStore((state) => state.hoveredWallId);
  const setHoveredWallId = useStore((state) => state.setHoveredWallId);
  const dragState = useStore((state) => state.dragState);
  const setDragState = useStore((state) => state.setDragState);
  const snapCandidateA = useStore((state) => state.snapCandidateA);
  const snapCandidateB = useStore((state) => state.snapCandidateB);
  const setSnapCandidateA = useStore((state) => state.setSnapCandidateA);
  const setSnapCandidateB = useStore((state) => state.setSnapCandidateB);
  
  const rafIdRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 48,
  });

  // Wall tool state
  const [wallToolState, setWallToolState] = useState<WallToolState>('idle');
  const [firstPointMm, setFirstPointMm] = useState<Vec2 | null>(null);
  const [currentPointMm, setCurrentPointMm] = useState<Vec2 | null>(null);
  const [hoverPointMm, setHoverPointMm] = useState<Vec2 | null>(null);
  const [activeSnapCandidate, setActiveSnapCandidate] = useState<SnapCandidate | null>(null);

  // Select tool state
  const [selectToolState, setSelectToolState] = useState<SelectToolState>('idle');

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 48,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset tool state when switching tools
  useEffect(() => {
    setWallToolState('idle');
    setFirstPointMm(null);
    setCurrentPointMm(null);
    setHoverPointMm(null);
    setActiveSnapCandidate(null);
    setSelectToolState('idle');
    setDragState({
      mode: null,
      startWorldMm: null,
      offsetAMm: null,
      offsetBMm: null,
      originalSceneSnapshot: null,
    });
    setSelectedWallId(null);
    setHoveredWallId(null);
    setSnapCandidateA(null);
    setSnapCandidateB(null);
  }, [activeTool, setSelectedWallId, setHoveredWallId, setDragState, setSnapCandidateA, setSnapCandidateB]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const scaleBy = 1.1;
      const stage = e.target.getStage();
      const oldScale = viewport.scale;
      const pointer = stage.getPointerPosition();

      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.max(MIN_ZOOM_SCALE, Math.min(MAX_ZOOM_SCALE, newScale));

      const mousePointTo = {
        x: (pointer.x - viewport.centerX) / oldScale,
        y: (viewport.centerY - pointer.y) / oldScale,
      };

      const newCenterX = pointer.x - mousePointTo.x * clampedScale;
      const newCenterY = pointer.y + mousePointTo.y * clampedScale;

      setViewport({
        centerX: newCenterX,
        centerY: newCenterY,
        scale: clampedScale,
      });

      rafIdRef.current = null;
    });
  }, [viewport, setViewport]);

  // Wall Tool Handlers
  const handleWallMouseDown = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point;

    if (wallToolState === 'idle') {
      setFirstPointMm(worldPos);
      setCurrentPointMm(worldPos);
      setWallToolState('first-point');
      setActiveSnapCandidate(snapResult.candidate || null);
      setHoverPointMm(null);
    } else if (wallToolState === 'first-point') {
      const wallLength = vec.distance(firstPointMm!, worldPos);
      if (wallLength >= MIN_WALL_LENGTH_MM) {
        createWall(firstPointMm!, worldPos);
      }
      setWallToolState('idle');
      setFirstPointMm(null);
      setCurrentPointMm(null);
      setActiveSnapCandidate(null);
    }
  }, [wallToolState, firstPointMm, viewport, scene]);

  const handleWallMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point;

    if (wallToolState === 'idle') {
      setHoverPointMm(worldPos);
      setActiveSnapCandidate(snapResult.candidate || null);
    } else if (wallToolState === 'first-point') {
      setCurrentPointMm(worldPos);
      setActiveSnapCandidate(snapResult.candidate || null);
      
      if (e.evt.buttons === 1) {
        setWallToolState('dragging');
      }
    } else if (wallToolState === 'dragging') {
      setCurrentPointMm(worldPos);
      setActiveSnapCandidate(snapResult.candidate || null);
    }
  }, [wallToolState, viewport, scene]);

  const handleWallMouseUp = useCallback((e: any) => {
    if (wallToolState !== 'dragging') return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point;

    const wallLength = vec.distance(firstPointMm!, worldPos);
    if (wallLength >= MIN_WALL_LENGTH_MM) {
      createWall(firstPointMm!, worldPos);
    }
    setWallToolState('idle');
    setFirstPointMm(null);
    setCurrentPointMm(null);
    setActiveSnapCandidate(null);
  }, [wallToolState, firstPointMm, viewport, scene]);

  // Select Tool Handlers
  const handleSelectMouseDown = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const worldPos = screenToWorld(pointer, viewport);

    const nodeRadiusMm = NODE_RADIUS_MM;
    const hitRadiusMm = 20 / viewport.scale;

    // Hit test selected wall's nodes first
    if (selectedWallId) {
      const hitResult = hitTestWallNode(worldPos, selectedWallId, scene, nodeRadiusMm);
      
      if (hitResult === 'node-a') {
        const wall = scene.walls.get(selectedWallId)!;
        const nodeA = scene.nodes.get(wall.nodeAId)!;
        
        setSelectToolState('dragging');
        setDragState({
          mode: 'node-a',
          startWorldMm: worldPos,
          offsetAMm: vec.sub(nodeA, worldPos),
          offsetBMm: null,
          originalSceneSnapshot: { nodes: new Map(scene.nodes), walls: new Map(scene.walls) },
        });
        return;
      } else if (hitResult === 'node-b') {
        const wall = scene.walls.get(selectedWallId)!;
        const nodeB = scene.nodes.get(wall.nodeBId)!;
        
        setSelectToolState('dragging');
        setDragState({
          mode: 'node-b',
          startWorldMm: worldPos,
          offsetAMm: null,
          offsetBMm: vec.sub(nodeB, worldPos),
          originalSceneSnapshot: { nodes: new Map(scene.nodes), walls: new Map(scene.walls) },
        });
        return;
      } else if (hitResult === 'wall') {
        const wall = scene.walls.get(selectedWallId)!;
        const nodeA = scene.nodes.get(wall.nodeAId)!;
        const nodeB = scene.nodes.get(wall.nodeBId)!;
        
        setSelectToolState('dragging');
        setDragState({
          mode: 'wall',
          startWorldMm: worldPos,
          offsetAMm: vec.sub(nodeA, worldPos),
          offsetBMm: vec.sub(nodeB, worldPos),
          originalSceneSnapshot: { nodes: new Map(scene.nodes), walls: new Map(scene.walls) },
        });
        return;
      }
    }

    // Hit test any wall
    const hitWallId = hitTestWalls(worldPos, scene, hitRadiusMm);

    if (hitWallId) {
      setSelectedWallId(hitWallId);
      
      const wall = scene.walls.get(hitWallId)!;
      const nodeA = scene.nodes.get(wall.nodeAId)!;
      const nodeB = scene.nodes.get(wall.nodeBId)!;
      
      setSelectToolState('dragging');
      setDragState({
        mode: 'wall',
        startWorldMm: worldPos,
        offsetAMm: vec.sub(nodeA, worldPos),
        offsetBMm: vec.sub(nodeB, worldPos),
        originalSceneSnapshot: { nodes: new Map(scene.nodes), walls: new Map(scene.walls) },
      });
    } else {
      setSelectedWallId(null);
      setDragState({
        mode: null,
        startWorldMm: null,
        offsetAMm: null,
        offsetBMm: null,
        originalSceneSnapshot: null,
      });
    }
  }, [viewport, scene, selectedWallId, setSelectedWallId, setDragState]);

  const handleSelectMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const worldPos = screenToWorld(pointer, viewport);

    if (selectToolState === 'dragging' && selectedWallId && dragState.mode && dragState.originalSceneSnapshot) {
      const wall = scene.walls.get(selectedWallId);
      if (!wall) return;

      const originalNodeA = dragState.originalSceneSnapshot.nodes.get(wall.nodeAId);
      const originalNodeB = dragState.originalSceneSnapshot.nodes.get(wall.nodeBId);
      if (!originalNodeA || !originalNodeB) return;

      // Check for snapping and merging
      const connectedToA = getConnectedWalls(wall.nodeAId, selectedWallId, scene);
      const connectedToB = getConnectedWalls(wall.nodeBId, selectedWallId, scene);

      const canSnapA = dragState.mode === 'node-a' || (dragState.mode === 'wall' && connectedToA.length === 0);
      const canSnapB = dragState.mode === 'node-b' || (dragState.mode === 'wall' && connectedToB.length === 0);

      let finalNodeAPos = originalNodeA;
      let finalNodeBPos = originalNodeB;
      let snapA: SnapCandidate | null = null;
      let snapB: SnapCandidate | null = null;

      // Build snap scene (exclude selected wall from snapping targets)
      const snapScene = {
        nodes: new Map(dragState.originalSceneSnapshot.nodes),
        walls: new Map(dragState.originalSceneSnapshot.walls),
      };
      snapScene.walls.delete(selectedWallId);

      if (dragState.mode === 'wall') {
        // Dragging entire wall - both nodes move together
        const delta = vec.sub(worldPos, dragState.startWorldMm!);
        const newNodeAPos = vec.add(originalNodeA, delta);
        const newNodeBPos = vec.add(originalNodeB, delta);

        // Try to snap node A if allowed
        if (canSnapA) {
          const nodeAScreenPos = worldToScreen(newNodeAPos, viewport);
          const snapResultA = findSnapCandidate(
            nodeAScreenPos,
            snapScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
            }
          );

          if (snapResultA.snapped) {
            // If node A snaps, move node B by the same delta to preserve wall length/angle
            const snapDelta = vec.sub(snapResultA.point, originalNodeA);
            finalNodeAPos = snapResultA.point;
            finalNodeBPos = vec.add(originalNodeB, snapDelta);
            snapA = snapResultA.candidate || null;
          } else {
            finalNodeAPos = newNodeAPos;
            finalNodeBPos = newNodeBPos;
          }
        } else {
          finalNodeAPos = newNodeAPos;
          finalNodeBPos = newNodeBPos;
        }

        // Try to snap node B if allowed (independent of node A)
        if (canSnapB) {
          const nodeBScreenPos = worldToScreen(finalNodeBPos, viewport);
          const snapResultB = findSnapCandidate(
            nodeBScreenPos,
            snapScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
            }
          );

          if (snapResultB.snapped) {
            // If node B also snaps, we need to decide whether to honor both snaps
            // For now, only apply node B snap if node A didn't snap
            if (!snapA) {
              const snapDelta = vec.sub(snapResultB.point, originalNodeB);
              finalNodeBPos = snapResultB.point;
              finalNodeAPos = vec.add(originalNodeA, snapDelta);
              snapB = snapResultB.candidate || null;
            } else {
              // Node A already snapped, just show guide for node B potential snap
              snapB = snapResultB.candidate || null;
            }
          }
        }
      } else if (dragState.mode === 'node-a') {
        // Dragging node A only
        const newNodeAPos = vec.add(worldPos, dragState.offsetAMm!);
        finalNodeBPos = originalNodeB; // Keep node B at original position

        if (canSnapA) {
          const snapResultA = findSnapCandidate(
            pointer,
            snapScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
            }
          );

          if (snapResultA.snapped) {
            finalNodeAPos = snapResultA.point;
            snapA = snapResultA.candidate || null;
          } else {
            finalNodeAPos = newNodeAPos;
          }
        } else {
          finalNodeAPos = newNodeAPos;
        }
      } else if (dragState.mode === 'node-b') {
        // Dragging node B only
        const newNodeBPos = vec.add(worldPos, dragState.offsetBMm!);
        finalNodeAPos = originalNodeA; // Keep node A at original position

        if (canSnapB) {
          const snapResultB = findSnapCandidate(
            pointer,
            snapScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
            }
          );

          if (snapResultB.snapped) {
            finalNodeBPos = snapResultB.point;
            snapB = snapResultB.candidate || null;
          } else {
            finalNodeBPos = newNodeBPos;
          }
        } else {
          finalNodeBPos = newNodeBPos;
        }
      }

      // Update scene with new positions
      const newNodes = new Map(scene.nodes);
      newNodes.set(wall.nodeAId, { ...originalNodeA, x: finalNodeAPos.x, y: finalNodeAPos.y });
      newNodes.set(wall.nodeBId, { ...originalNodeB, x: finalNodeBPos.x, y: finalNodeBPos.y });

      setScene({ nodes: newNodes, walls: scene.walls });
      setSnapCandidateA(snapA);
      setSnapCandidateB(snapB);
    } else if (selectToolState === 'idle') {
      // Update hover state
      const hitRadiusMm = 20 / viewport.scale;
      const hitWallId = hitTestWalls(worldPos, scene, hitRadiusMm);
      setHoveredWallId(hitWallId);
    }
  }, [selectToolState, selectedWallId, dragState, viewport, scene, setScene, setHoveredWallId, setSnapCandidateA, setSnapCandidateB]);

  const handleSelectMouseUp = useCallback(() => {
    if (selectToolState === 'dragging' && selectedWallId && dragState.originalSceneSnapshot) {
      const wall = scene.walls.get(selectedWallId);
      if (!wall) return;

      let finalScene = scene;

      // Check if node A should merge with another node
      const nodeA = scene.nodes.get(wall.nodeAId);
      if (nodeA && snapCandidateA?.type === 'node' && snapCandidateA.entityId) {
        const targetNodeId = snapCandidateA.entityId;
        if (targetNodeId !== wall.nodeAId && targetNodeId !== wall.nodeBId) {
          finalScene = mergeNodes(wall.nodeAId, targetNodeId, finalScene);
        }
      }

      // Check if node B should merge with another node
      const nodeB = finalScene.nodes.get(wall.nodeBId);
      if (nodeB && snapCandidateB?.type === 'node' && snapCandidateB.entityId) {
        const targetNodeId = snapCandidateB.entityId;
        const currentNodeBId = finalScene.walls.get(selectedWallId)?.nodeBId;
        if (currentNodeBId && targetNodeId !== currentNodeBId && targetNodeId !== finalScene.walls.get(selectedWallId)?.nodeAId) {
          finalScene = mergeNodes(currentNodeBId, targetNodeId, finalScene);
        }
      }

      setScene(finalScene);
      setSelectToolState('idle');
      setDragState({
        mode: null,
        startWorldMm: null,
        offsetAMm: null,
        offsetBMm: null,
        originalSceneSnapshot: null,
      });
      setSnapCandidateA(null);
      setSnapCandidateB(null);
    }
  }, [selectToolState, selectedWallId, dragState, scene, snapCandidateA, snapCandidateB, setScene, setDragState, setSnapCandidateA, setSnapCandidateB]);

  // Combined handlers
  const handleMouseDown = useCallback((e: any) => {
    if (activeTool === 'wall') {
      handleWallMouseDown(e);
    } else if (activeTool === 'select') {
      handleSelectMouseDown(e);
    }
  }, [activeTool, handleWallMouseDown, handleSelectMouseDown]);

  const handleMouseMove = useCallback((e: any) => {
    if (activeTool === 'wall') {
      handleWallMouseMove(e);
    } else if (activeTool === 'select') {
      handleSelectMouseMove(e);
    }
  }, [activeTool, handleWallMouseMove, handleSelectMouseMove]);

  const handleMouseUp = useCallback((e: any) => {
    if (activeTool === 'wall') {
      handleWallMouseUp(e);
    } else if (activeTool === 'select') {
      handleSelectMouseUp();
    }
  }, [activeTool, handleWallMouseUp, handleSelectMouseUp]);

  const createWall = (startMm: Vec2, endMm: Vec2) => {
    const nodeAId = `node-${Date.now()}-a`;
    const nodeBId = `node-${Date.now()}-b`;
    const wallId = `wall-${Date.now()}`;

    const newNodes = new Map(scene.nodes);
    const newWalls = new Map(scene.walls);

    newNodes.set(nodeAId, { id: nodeAId, x: startMm.x, y: startMm.y });
    newNodes.set(nodeBId, { id: nodeBId, x: endMm.x, y: endMm.y });

    newWalls.set(wallId, {
      id: wallId,
      nodeAId,
      nodeBId,
      thicknessMm: wallParams.thicknessMm,
      heightMm: wallParams.heightMm,
      raiseFromFloorMm: wallParams.raiseFromFloorMm,
    });

    setScene({ nodes: newNodes, walls: newWalls });
  };

  const previewWall = (wallToolState === 'first-point' || wallToolState === 'dragging') && 
                      firstPointMm && 
                      currentPointMm &&
                      vec.distance(firstPointMm, currentPointMm) >= MIN_WALL_LENGTH_MM
    ? { startMm: firstPointMm, endMm: currentPointMm }
    : null;

  const showWallPreview = activeTool === 'wall' && previewWall;
  const showWallHover = activeTool === 'wall' && hoverPointMm && !previewWall;
  const showSelectGuides = activeTool === 'select' && selectToolState === 'dragging';

  // Collect all snap candidates for guides layer
  const selectGuideCandidates = showSelectGuides ? [snapCandidateA, snapCandidateB] : [];

  return (
    <KonvaStage
      width={dimensions.width}
      height={dimensions.height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ display: 'block', position: 'absolute', top: 0, left: 0, cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
    >
      <GridLayer />
      <WallsLayer />
      {showWallPreview && <PreviewLayer previewWall={previewWall} hoverPoint={null} />}
      {showWallHover && <PreviewLayer previewWall={null} hoverPoint={hoverPointMm} />}
      {activeTool === 'wall' && <GuidesLayer snapCandidates={[activeSnapCandidate]} />}
      {showSelectGuides && <GuidesLayer snapCandidates={selectGuideCandidates} />}
    </KonvaStage>
  );
}