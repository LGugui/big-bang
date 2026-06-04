import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ObjectManager } from '../objects/object-manager';
import { SelectionManager } from '../objects/selection-manager';
import { InfoPanel } from '../ui/info-panel';
import { SceneAnalyzer } from './scene-analyzer';
import { SceneSegmenter } from './scene-segmenter';

export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private objectManager: ObjectManager;
  private selectionManager: SelectionManager;
  private analyzer: SceneAnalyzer | null = null;
  private segmenter: SceneSegmenter | null = null;
  private animationId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 1.5, 7);
    this.camera.lookAt(0, 0.5, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.3;
    this.controls.target.set(0, 0.5, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const point = new THREE.PointLight(0x00AAFF, 1.5, 30);
    point.position.set(0, 6, 0);
    this.scene.add(point);

    this.selectionManager = new SelectionManager(this.scene, this.camera, canvas, this.controls);
    this.objectManager = new ObjectManager(this.scene, this.camera, canvas);
    this.objectManager.setSelectionManager(this.selectionManager);
    this.objectManager.setInfoPanel(new InfoPanel());

    window.addEventListener('resize', this.onResize);
  }

  initAnalyzers(video: HTMLVideoElement): void {
    this.analyzer = new SceneAnalyzer();
    this.analyzer.init(video);
    this.objectManager.setSceneAnalyzer(this.analyzer);
    this.segmenter = new SceneSegmenter();
  }

  getSegmenter(): SceneSegmenter | null { return this.segmenter; }
  getObjectManager(): ObjectManager { return this.objectManager; }
  getSelectionManager(): SelectionManager { return this.selectionManager; }
  getThreeScene(): THREE.Scene { return this.scene; }
  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  getAnalyzer(): SceneAnalyzer | null { return this.analyzer; }

  start(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.controls.update();
      this.objectManager.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stop(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
