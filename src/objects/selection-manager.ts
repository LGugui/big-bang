import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type TransformMode = 'translate' | 'rotate' | 'scale';

export class SelectionManager {
  private tc: TransformControls;
  selected: THREE.Group | null = null;
  private selectedWire: THREE.Mesh | null = null;
  private originalColor: THREE.Color | null = null;
  onSelectionChange?: (obj: THREE.Group | null) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    orbit: OrbitControls
  ) {
    this.tc = new TransformControls(camera, canvas);
    this.tc.setMode('translate');
    scene.add(this.tc as unknown as THREE.Object3D);

    // Desativa orbit durante drag
    this.tc.addEventListener('dragging-changed', (e: any) => {
      orbit.enabled = !e.value;
    });

    // Teclas de atalho
    window.addEventListener('keydown', (e) => {
      if (!this.selected) return;
      if (e.key === 't' || e.key === 'T') this.setMode('translate');
      if (e.key === 'r' || e.key === 'R') this.setMode('rotate');
      if (e.key === 's' || e.key === 'S') this.setMode('scale');
      if (e.key === 'Escape') this.deselect();
    });
  }

  select(group: THREE.Group): void {
    if (this.selected === group) return;
    this.deselect();

    this.selected = group;

    // Destacar wireframe
    const wire = group.children.find(
      c => c instanceof THREE.Mesh && (c.material as THREE.MeshBasicMaterial).wireframe
    ) as THREE.Mesh | undefined;

    if (wire) {
      const mat = wire.material as THREE.MeshBasicMaterial;
      this.selectedWire = wire;
      this.originalColor = mat.color.clone();
      mat.color.set(0xffffff);
      mat.opacity = 1.0;
    }

    this.tc.attach(group);
    this.onSelectionChange?.(group);
  }

  deselect(): void {
    if (!this.selected) return;

    // Restaurar wireframe
    if (this.selectedWire && this.originalColor) {
      const mat = this.selectedWire.material as THREE.MeshBasicMaterial;
      mat.color.copy(this.originalColor);
      mat.opacity = 0.75;
    }

    this.tc.detach();
    this.selected = null;
    this.selectedWire = null;
    this.originalColor = null;
    this.onSelectionChange?.(null);
  }

  setMode(mode: TransformMode): void {
    this.tc.setMode(mode);
  }

  getMode(): TransformMode {
    return this.tc.getMode() as TransformMode;
  }
}
