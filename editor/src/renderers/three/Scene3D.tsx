import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../../state/store';
import type { Wall, Node } from '../../core/domain/types';
import * as vec from '../../core/math/vec';

// ✅ Global singleton to prevent double initialization
let globalRenderer: THREE.WebGLRenderer | null = null;
let globalScene: THREE.Scene | null = null;
let globalCamera: THREE.PerspectiveCamera | null = null;
let globalControls: OrbitControls | null = null;
let globalWallGroup: THREE.Group | null = null;
let globalRafId: number | null = null;

export function Scene3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const scene = useStore((state) => state.scene);

  // Initialize Three.js scene ONCE (survives StrictMode double-mount)
  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const container = containerRef.current;
    
    // ✅ Get actual container dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;

    console.log('🎨 Initializing Three.js scene', { width, height });

    // Reuse or create renderer
    if (!globalRenderer) {
      globalRenderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: false,
      });
      globalRenderer.setClearColor(0xffffff, 1);
      globalRenderer.shadowMap.enabled = true;
      globalRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    // ✅ Always update size to match container
    globalRenderer.setSize(width, height);
    globalRenderer.setPixelRatio(window.devicePixelRatio);
    
    // Attach to current container
    if (globalRenderer.domElement.parentNode !== container) {
      // ✅ Set canvas to fill container
      globalRenderer.domElement.style.display = 'block';
      globalRenderer.domElement.style.width = '100%';
      globalRenderer.domElement.style.height = '100%';
      container.appendChild(globalRenderer.domElement);
    }

    // Reuse or create scene
    if (!globalScene) {
      globalScene = new THREE.Scene();
      globalScene.background = new THREE.Color(0xffffff);

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      globalScene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(5000, 8000, 3000);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.left = -10000;
      dirLight.shadow.camera.right = 10000;
      dirLight.shadow.camera.top = 10000;
      dirLight.shadow.camera.bottom = -10000;
      dirLight.shadow.camera.far = 20000;
      dirLight.shadow.bias = -0.001;
      globalScene.add(dirLight);

      // ✅ Grid Helper (larger to match 2D infinite grid feel)
      const gridHelper = new THREE.GridHelper(
        50000, // 50m size (matches 2D coverage)
        50,    // 50 divisions = 1m spacing
        0xcccccc, // center line color
        0xe5e5e5  // grid color
      );
      gridHelper.position.y = 0;
      globalScene.add(gridHelper);

      // ✅ Axes Helper (larger for better visibility)
      const axesHelper = new THREE.AxesHelper(20000); // 20m axes
      axesHelper.position.set(0, 0, 0);
      globalScene.add(axesHelper);

      // Wall group
      globalWallGroup = new THREE.Group();
      globalScene.add(globalWallGroup);
    }

    // Reuse or create camera
    if (!globalCamera) {
      globalCamera = new THREE.PerspectiveCamera(50, width / height, 10, 100000);
      globalCamera.position.set(5000, 5000, 5000);
      globalCamera.lookAt(0, 0, 0);
    } else {
      // ✅ Update aspect ratio for new container size
      globalCamera.aspect = width / height;
      globalCamera.updateProjectionMatrix();
    }

    // Reuse or create controls
    if (!globalControls) {
      globalControls = new OrbitControls(globalCamera, globalRenderer.domElement);
      globalControls.enableDamping = true;
      globalControls.dampingFactor = 0.05;
      globalControls.minDistance = 500;
      globalControls.maxDistance = 50000; // ✅ Increased max zoom out
      globalControls.maxPolarAngle = Math.PI / 2 - 0.01;
      globalControls.enablePan = true;
      globalControls.panSpeed = 1.0;
      globalControls.rotateSpeed = 0.8;
      globalControls.zoomSpeed = 1.2;
      globalControls.screenSpacePanning = false;
      globalControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      globalControls.enabled = true;
      console.log('✅ OrbitControls created and ready');
    }

    // Start animation loop if not already running
    if (globalRafId === null) {
      const animate = () => {
        globalRafId = requestAnimationFrame(animate);
        if (globalControls) globalControls.update();
        if (globalRenderer && globalScene && globalCamera) {
          globalRenderer.render(globalScene, globalCamera);
        }
      };
      animate();
      console.log('🎬 Animation loop started');
    }

    // ✅ Handle resize to keep canvas filling container
    const handleResize = () => {
      if (!container || !globalCamera || !globalRenderer) return;
      
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      
      console.log('📐 Resizing 3D canvas', { newWidth, newHeight });
      
      globalCamera.aspect = newWidth / newHeight;
      globalCamera.updateProjectionMatrix();
      globalRenderer.setSize(newWidth, newHeight);
    };
    
    // ✅ Use ResizeObserver for reliable container size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    // Cleanup (DON'T dispose Three.js objects - keep them alive)
    return () => {
      console.log('🧹 Component unmounting (keeping Three.js singleton alive)');
      resizeObserver.disconnect();
      mountedRef.current = false;
      
      // Remove canvas from DOM but don't dispose objects
      if (globalRenderer?.domElement.parentNode === container) {
        container.removeChild(globalRenderer.domElement);
      }
    };
  }, []); // Empty deps - only run on true mount/unmount

  // Rebuild walls when scene changes
  useEffect(() => {
    if (!globalWallGroup || !globalScene) return;

    console.log('🔨 Updating walls, count:', scene.walls.size);

    const wallGroup = globalWallGroup;

    // Clear existing walls
    while (wallGroup.children.length > 0) {
      const child = wallGroup.children[0];
      wallGroup.remove(child);
      
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    // Build walls
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.8,
      metalness: 0.1,
    });

    for (const wall of scene.walls.values()) {
      const nodeA = scene.nodes.get(wall.nodeAId);
      const nodeB = scene.nodes.get(wall.nodeBId);

      if (!nodeA || !nodeB) continue;

      const mesh = buildWallMesh(wall, nodeA, nodeB, wallMaterial);
      if (mesh) {
        wallGroup.add(mesh);
      }
    }

    // Auto-center camera on first load
    if (scene.walls.size > 0 && globalControls && globalCamera) {
      const bounds = calculateSceneBounds(scene);
      if (bounds) {
        const center = {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
          z: 0,
        };

        globalControls.target.set(center.x, center.y, center.z);
        
        const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        const distance = size * 1.5;
        
        globalCamera.position.set(
          center.x + distance * 0.7,
          center.y + distance * 0.7,
          center.z + distance * 0.7
        );
        
        globalControls.update();
        console.log('📷 Camera centered on scene');
      }
    }
  }, [scene]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0, // ✅ Ensure full coverage
        bottom: 0, // ✅ Ensure full coverage
        margin: 0,
        padding: 0,
        overflow: 'hidden', // ✅ Prevent scrollbars
        backgroundColor: '#ffffff',
        cursor: 'grab',
        pointerEvents: 'auto',
        touchAction: 'none',
      }} 
    />
  );
}

// Helper functions
function calculateSceneBounds(scene: { nodes: Map<string, Node>; walls: Map<string, Wall> }) {
  if (scene.nodes.size === 0) return null;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const node of scene.nodes.values()) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }

  return { minX, maxX, minY, maxY };
}

function buildWallMesh(
  wall: Wall,
  nodeA: Node,
  nodeB: Node,
  material: THREE.Material
): THREE.Mesh | null {
  const dir = vec.normalize(vec.sub(nodeB, nodeA));
  const perp = vec.perpendicular(dir);
  const halfThickness = wall.thicknessMm / 2;

  // Calculate four corners of the wall base (in XZ plane, Y=0)
  const startLeft = vec.add(nodeA, vec.scale(perp, halfThickness));
  const startRight = vec.sub(nodeA, vec.scale(perp, halfThickness));
  const endLeft = vec.add(nodeB, vec.scale(perp, halfThickness));
  const endRight = vec.sub(nodeB, vec.scale(perp, halfThickness));

  // Create shape for extrusion (2D polygon in XZ plane)
  const shape = new THREE.Shape();
  shape.moveTo(startLeft.x, startLeft.y);
  shape.lineTo(endLeft.x, endLeft.y);
  shape.lineTo(endRight.x, endRight.y);
  shape.lineTo(startRight.x, startRight.y);
  shape.lineTo(startLeft.x, startLeft.y);

  // Extrude upward in +Y direction
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: wall.heightMm,
    bevelEnabled: false,
  });

  // Rotate to make extrusion go up in +Y
  geometry.rotateX(-Math.PI / 2);

  // Translate upward by raiseFromFloorMm
  geometry.translate(0, wall.raiseFromFloorMm, 0);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}