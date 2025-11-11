import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Scene, Wall, Node } from '../../../core/domain/types';
import { buildWallPolygon } from '../../../core/geometry/miter';

export class ThreeSceneAdapter {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private wallGroup: THREE.Group;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Set canvas to fill container
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

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
    this.scene.add(dirLight);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(50000, 50, 0xcccccc, 0xe5e5e5);
    gridHelper.position.y = 0;
    this.scene.add(gridHelper);

    // Axes Helper
    const axesHelper = new THREE.AxesHelper(20000);
    axesHelper.position.set(0, 0, 0);
    this.scene.add(axesHelper);

    // Wall group
    this.wallGroup = new THREE.Group();
    this.scene.add(this.wallGroup);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, width / height, 10, 100000);
    this.camera.position.set(5000, 5000, 5000);
    this.camera.lookAt(0, 0, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 500;
    this.controls.maxDistance = 50000;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.controls.enablePan = true;
    this.controls.panSpeed = 1.0;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.2;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.enabled = true;

    // Start animation loop
    this.startAnimationLoop();

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      
      this.camera.aspect = newWidth / newHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(newWidth, newHeight);
    });
    this.resizeObserver.observe(container);

    console.log('✅ ThreeSceneAdapter initialized');
  }

  /**
   * Apply scene changes (called when Zustand store updates)
   */
  applyScene(scene: Scene): void {
    console.log('🔨 Updating 3D scene, walls:', scene.walls.size);

    // Clear existing walls
    while (this.wallGroup.children.length > 0) {
      const child = this.wallGroup.children[0];
      this.wallGroup.remove(child);
      
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    // Build walls with mitering
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.8,
      metalness: 0.1,
    });

    for (const wall of scene.walls.values()) {
      const mesh = this.buildWallMesh(wall, scene, wallMaterial);
      if (mesh) {
        this.wallGroup.add(mesh);
      }
    }

    // Auto-center camera on first load
    if (scene.walls.size > 0) {
      const bounds = this.calculateSceneBounds(scene);
      if (bounds) {
        const center = {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
          z: 0,
        };

        this.controls.target.set(center.x, center.y, center.z);
        
        const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        const distance = size * 1.5;
        
        this.camera.position.set(
          center.x + distance * 0.7,
          center.y + distance * 0.7,
          center.z + distance * 0.7
        );
        
        this.controls.update();
        console.log('📷 Camera centered on scene');
      }
    }
  }

  private startAnimationLoop(): void {
    const animate = () => {
      this.rafId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  private calculateSceneBounds(scene: Scene) {
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

  /**
   * Build a wall mesh with mitered corners
   * Uses the miter computation from core/geometry/miter.ts
   */
  private buildWallMesh(
    wall: Wall,
    scene: Scene,
    material: THREE.Material
  ): THREE.Mesh | null {
    // ✅ Use mitering to compute wall base polygon with clean corners
    const polygonMm = buildWallPolygon(wall, scene);

    if (polygonMm.length < 3) {
      console.warn(`Wall ${wall.id} has invalid polygon (${polygonMm.length} points)`);
      return null;
    }

    // Create shape from mitered polygon in XZ plane (ground plane)
    const shape = new THREE.Shape();
    
    // Start at first point
    shape.moveTo(polygonMm[0].x, polygonMm[0].y);
    
    // Add remaining points
    for (let i = 1; i < polygonMm.length; i++) {
      shape.lineTo(polygonMm[i].x, polygonMm[i].y);
    }
    
    // Close the path
    shape.closePath();

    // Extrude upward in +Y direction
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: wall.heightMm,
      bevelEnabled: false,
    });

    // Rotate to make extrusion go up in +Y
    // ExtrudeGeometry extrudes along +Z by default
    // Rotating -90° around X makes Z point up (becomes Y)
    geometry.rotateX(-Math.PI / 2);

    // Translate upward by raiseFromFloorMm
    geometry.translate(0, wall.raiseFromFloorMm, 0);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  dispose(): void {
    console.log('🧹 Disposing ThreeSceneAdapter');

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.controls.dispose();

    // Dispose all geometries and materials
    this.wallGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.scene.clear();
    
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    
    this.renderer.dispose();
  }
}