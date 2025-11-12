import { useState, useEffect } from 'react';
import { useStore } from '../../state/store';
import { screenToWorld } from '../../renderers/konva/viewport';
import { buildWallPolygon } from '../../core/geometry/miter';
import type { Vec2 } from '../../core/math/vec';

export function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [cursorPx, setCursorPx] = useState<Vec2 | null>(null);
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const selectedWallIds = useStore((state) => state.selectedWallIds);

  // Toggle debug overlay with Ctrl+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setEnabled((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track cursor position
  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCursorPx({ x: e.clientX, y: e.clientY - 48 }); // Subtract header height
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [enabled]);

  // ✅ Don't render anything if disabled
  if (!enabled) return null;

  const cursorMm = cursorPx ? screenToWorld(cursorPx, viewport) : null;
  const selectedWallId = selectedWallIds.size === 1 ? Array.from(selectedWallIds)[0] : null;
  const selectedWall = selectedWallId ? scene.walls.get(selectedWallId) : null;

  let nodeA = null;
  let nodeB = null;
  let polygonPoints: Vec2[] = [];

  if (selectedWall) {
    nodeA = scene.nodes.get(selectedWall.nodeAId);
    nodeB = scene.nodes.get(selectedWall.nodeBId);
    polygonPoints = buildWallPolygon(selectedWall, scene);
  }

  // Helper to format wall ID consistently with miter.ts logs
  const formatWallId = (id: string): string => {
    return id.slice(-5);
  };

  return (
    <div 
      className="fixed top-16 left-4 z-50 bg-black/90 text-white p-4 rounded-lg font-mono text-xs max-w-md shadow-2xl border border-gray-700 max-h-[calc(100vh-5rem)] overflow-y-auto"
      style={{ pointerEvents: 'auto' }} // ✅ Only overlay itself receives pointer events
    >
      {/* Scrollbar styling */}
      <style>{`
        .fixed.top-16::-webkit-scrollbar {
          width: 8px;
        }
        .fixed.top-16::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }
        .fixed.top-16::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        .fixed.top-16::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>

      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600">
        <h3 className="font-bold text-sm">Debug Overlay</h3>
        <span className="text-gray-400 text-[10px]">Ctrl+Shift+D to toggle</span>
      </div>

      {/* Cursor Position */}
      <div className="mb-4">
        <h4 className="text-green-400 font-semibold mb-1">Cursor Position</h4>
        <div className="pl-2 space-y-0.5">
          <div>
            Screen: {cursorPx ? `(${cursorPx.x.toFixed(1)}px, ${cursorPx.y.toFixed(1)}px)` : 'N/A'}
          </div>
          <div>
            World: {cursorMm ? `(${cursorMm.x.toFixed(1)}mm, ${cursorMm.y.toFixed(1)}mm)` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Viewport Info */}
      <div className="mb-4">
        <h4 className="text-blue-400 font-semibold mb-1">Viewport</h4>
        <div className="pl-2 space-y-0.5">
          <div>Center: ({viewport.centerX.toFixed(1)}px, {viewport.centerY.toFixed(1)}px)</div>
          <div>Scale: {viewport.scale.toFixed(4)} px/mm</div>
          <div>Zoom: {(viewport.scale * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Selected Wall Details */}
      {selectedWall && nodeA && nodeB ? (
        <div className="mb-4">
          <h4 className="text-yellow-400 font-semibold mb-1">Selected Wall</h4>
          <div className="pl-2 space-y-0.5">
            <div className="bg-yellow-900/30 p-2 rounded border border-yellow-700/50 mb-2">
              <div className="text-yellow-300 font-bold text-sm">
                Wall {formatWallId(selectedWallId)}
              </div>
              <div className="text-gray-400 text-[10px] mt-1">
                Full ID: {selectedWallId}
              </div>
            </div>
            
            <div className="mt-2 text-cyan-400 font-semibold">Parameters:</div>
            <div className="pl-2 bg-cyan-900/20 p-2 rounded space-y-0.5">
              <div>Thickness: {selectedWall.thicknessMm.toFixed(1)}mm</div>
              <div>Height: {selectedWall.heightMm.toFixed(1)}mm</div>
              <div>Raise: {selectedWall.raiseFromFloorMm.toFixed(1)}mm</div>
              <div>Half thickness: {(selectedWall.thicknessMm / 2).toFixed(1)}mm</div>
            </div>
            
            <div className="mt-2 text-cyan-400 font-semibold">Nodes:</div>
            <div className="pl-2 bg-cyan-900/20 p-2 rounded space-y-0.5">
              <div>
                <span className="text-green-400">Node A:</span> ({nodeA.x.toFixed(1)}, {nodeA.y.toFixed(1)}) mm
                <div className="text-gray-500 text-[10px] ml-2">
                  {nodeA.id.slice(-8)}
                </div>
              </div>
              <div>
                <span className="text-red-400">Node B:</span> ({nodeB.x.toFixed(1)}, {nodeB.y.toFixed(1)}) mm
                <div className="text-gray-500 text-[10px] ml-2">
                  {nodeB.id.slice(-8)}
                </div>
              </div>
            </div>

            <div className="mt-2 text-orange-400 font-semibold">
              Polygon Points ({polygonPoints.length}):
            </div>
            <div className="pl-2 bg-orange-900/20 p-2 rounded max-h-32 overflow-y-auto space-y-1">
              <div className="text-gray-400 text-[10px] mb-1 italic">
                Hover over vertices in canvas for details
              </div>
              {polygonPoints.map((pt, i) => (
                <div key={i} className="text-[10px] font-mono">
                  <span className="text-orange-300">#{i + 1}:</span>{' '}
                  ({pt.x.toFixed(1)}, {pt.y.toFixed(1)}) mm
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <h4 className="text-gray-500 font-semibold mb-1">Selected Wall</h4>
          <div className="pl-2 text-gray-400">
            {selectedWallIds.size === 0 ? 'No wall selected' : `${selectedWallIds.size} walls selected (select 1 for details)`}
          </div>
        </div>
      )}

      {/* Scene Stats */}
      <div>
        <h4 className="text-purple-400 font-semibold mb-1">Scene Stats</h4>
        <div className="pl-2 space-y-0.5">
          <div>Nodes: {scene.nodes.size}</div>
          <div>Walls: {scene.walls.size}</div>
          <div>Selected: {selectedWallIds.size}</div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="text-gray-400 text-[10px] space-y-1">
          <div>💡 <span className="text-gray-300">Select a wall</span> to see detailed miter info</div>
          <div>💡 <span className="text-gray-300">Hover over orange vertices</span> to see wall info</div>
          <div>💡 <span className="text-gray-300">Hover over ray origins</span> to see ray details</div>
        </div>
      </div>
    </div>
  );
}