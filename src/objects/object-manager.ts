import * as THREE from 'three';
import { createPrimitive } from './primitives';
import type { ShapeType } from './primitives';
import type { SelectionManager } from './selection-manager';
import type { InfoPanel } from '../ui/info-panel';
import type { SceneAnalyzer } from '../scene/scene-analyzer';
import { createContactShadow, updateContactShadow } from '../scene/contact-shadow';

interface ManagedObject {
  group: THREE.Group;
  shadow: THREE.Mesh;
  floorY: number;
}

export class ObjectManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private items: ManagedObject[] = [];
  private raycaster = new THREE.Raycaster();
  private spawnPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointer = new THREE.Vector2();
  private activeShape: ShapeType = 'cube';
  private selMgr: SelectionManager | null = null;
  private infoPanel: InfoPanel | null = null;
  private analyzer: SceneAnalyzer | null = null;

  // Grab state
  private grabbing = false;
  private grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pendingSpawn: { pos: THREE.Vector3; floorY: number } | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.camera = camera;
    canvas.addEventListener('click', this.onClick);
    window.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
    });
  }

  setSelectionManager(mgr: SelectionManager): void { this.selMgr = mgr; }
  setInfoPanel(panel: InfoPanel): void { this.infoPanel = panel; }
  setSceneAnalyzer(a: SceneAnalyzer): void { this.analyzer = a; }
  setShape(s: ShapeType): void { this.activeShape = s; }

  get objects(): THREE.Group[] { return this.items.map(i => i.group); }

  // ── Pinch grab ─────────────────────────────────────────────────────

  pinchStart(ndcX: number, ndcY: number): void {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Try grab existing object
    const meshes = this.items.flatMap(i => i.group.children as THREE.Mesh[]);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hitItem = this.items.find(i => i.group === hits[0].object.parent);
      if (hitItem) {
        this.selMgr?.select(hitItem.group);
        this.infoPanel?.show(hitItem.group.userData.shape ?? 'objeto');
        this.grabPlane.constant = -hitItem.group.userData.baseY;
        this.grabbing = true;
        this.pendingSpawn = null;
        return;
      }
    }

    // Record potential spawn
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.spawnPlane, target);
    const normY = (1 - ndcY) / 2;
    const surface = this.analyzer?.getSurfaceAt((ndcX + 1) / 2, normY);
    const floorY = surface?.type === 'table' ? 1.0 : 0;
    this.pendingSpawn = hit ? { pos: target.clone(), floorY } : null;
    this.grabbing = false;
  }

  pinchMove(ndcX: number, ndcY: number): void {
    if (!this.grabbing || !this.selMgr?.selected) return;
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const target = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.grabPlane, target)) return;
    const sel = this.selMgr.selected;
    sel.position.x = target.x;
    sel.position.z = target.z;
  }

  pinchEnd(): void {
    if (this.grabbing && this.selMgr?.selected) {
      this.selMgr.selected.userData.baseY = this.selMgr.selected.position.y;
      this.grabbing = false;
      return;
    }
    if (this.pendingSpawn) {
      this.spawnAt(this.pendingSpawn.pos, this.pendingSpawn.floorY);
      this.pendingSpawn = null;
    }
  }

  virtualClick(ndcX: number, ndcY: number): void {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.handleRaycast(ndcX, ndcY);
  }

  deleteSelected(): void {
    const sel = this.selMgr?.selected;
    if (!sel) return;
    this.grabbing = false;
    this.selMgr!.deselect();
    this.infoPanel?.hide();

    const item = this.items.find(i => i.group === sel);
    if (item) {
      this.scene.remove(item.shadow);
      this.scene.remove(item.group);
      item.group.traverse(c => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          (c.material as THREE.Material).dispose();
        }
      });
      this.items = this.items.filter(i => i !== item);
    }
  }

  update(): void {
    const t = Date.now() * 0.001;
    const sel = this.selMgr?.selected ?? null;

    this.items.forEach((item, i) => {
      const { group, shadow, floorY } = item;

      if (sel === group) {
        this.infoPanel?.update(group);
        if (!this.grabbing) {
          // Float sutil mesmo selecionado
          group.position.y = group.userData.baseY + Math.sin(t + i) * 0.03;
        }
      } else {
        group.position.y = group.userData.baseY + Math.sin(t + i * 1.2) * 0.06;
        group.rotation.y += 0.003;
      }

      updateContactShadow(shadow, group.position, floorY);
    });
  }

  // ── Internal ───────────────────────────────────────────────────────

  private spawnAt(pos: THREE.Vector3, floorY = 0): void {
    const group = createPrimitive(this.activeShape, new THREE.Vector3(pos.x, floorY, pos.z));
    group.userData.shape = this.activeShape;
    group.userData.baseY = floorY + 0.6;
    group.position.y = group.userData.baseY;

    const shadow = createContactShadow(this.scene);
    this.scene.add(group);
    this.items.push({ group, shadow, floorY });
  }

  private handleRaycast(ndcX: number, ndcY: number): void {
    const meshes = this.items.flatMap(i => i.group.children as THREE.Mesh[]);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hitItem = this.items.find(i => i.group === hits[0].object.parent);
      if (hitItem) {
        this.selMgr?.select(hitItem.group);
        this.infoPanel?.show(hitItem.group.userData.shape ?? 'objeto');
        return;
      }
    }

    this.selMgr?.deselect();
    this.infoPanel?.hide();

    const target = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.spawnPlane, target)) return;

    // Surface detection
    const normX = (ndcX + 1) / 2;
    const normY = (1 - ndcY) / 2;
    const surface = this.analyzer?.getSurfaceAt(normX, normY);
    const floorY = surface?.type === 'table' ? 1.0 : 0;

    this.spawnAt(target, floorY);
  }

  private onClick = (e: MouseEvent): void => {
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.handleRaycast(ndcX, ndcY);
  };
}
