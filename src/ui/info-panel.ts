import * as THREE from 'three';

export class InfoPanel {
  private el: HTMLElement;
  private shapeEl: HTMLElement;
  private fields: Record<string, HTMLElement> = {};

  constructor() {
    this.el = document.getElementById('info-panel')!;
    this.shapeEl = this.el.querySelector('#info-shape')!;

    ['px','py','pz','rx','ry','rz','sx','sy','sz'].forEach(id => {
      this.fields[id] = this.el.querySelector(`#info-${id}`)!;
    });
  }

  show(shapeName: string): void {
    this.shapeEl.textContent = shapeName.toUpperCase();
    this.el.style.display = 'block';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  update(obj: THREE.Group): void {
    const p = obj.position;
    const r = obj.rotation;
    const s = obj.scale;
    const f = (n: number) => n.toFixed(2);

    this.fields['px'].textContent = f(p.x);
    this.fields['py'].textContent = f(p.y);
    this.fields['pz'].textContent = f(p.z);
    this.fields['rx'].textContent = f(THREE.MathUtils.radToDeg(r.x));
    this.fields['ry'].textContent = f(THREE.MathUtils.radToDeg(r.y));
    this.fields['rz'].textContent = f(THREE.MathUtils.radToDeg(r.z));
    this.fields['sx'].textContent = f(s.x);
    this.fields['sy'].textContent = f(s.y);
    this.fields['sz'].textContent = f(s.z);
  }
}
