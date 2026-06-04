import * as THREE from 'three';
import { pipeline, env } from '@xenova/transformers';
import type { DetectedObject } from './scene-analyzer';

env.allowLocalModels = false;
env.useBrowserCache  = true;

type DepthPipeline = Awaited<ReturnType<typeof pipeline>>;

export class DepthScanner {
  private pipe: DepthPipeline | null = null;
  loading = false;
  private scene: THREE.Scene;
  private offscreen = document.createElement('canvas');
  private offCtx    = this.offscreen.getContext('2d')!;
  onStatusChange?: (msg: string) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async loadModel(): Promise<void> {
    if (this.pipe || this.loading) return;
    this.loading = true;
    this.onStatusChange?.('◌ BAIXANDO DEPTH MODEL (~25MB)...');
    try {
      this.pipe = await pipeline(
        'depth-estimation',
        'Xenova/depth-anything-small-hf',
        { progress_callback: (p: any) => {
          if (p.status === 'downloading' && p.total > 0) {
            const pct = Math.round((p.loaded / p.total) * 100);
            this.onStatusChange?.(`◌ DEPTH MODEL ${pct}%`);
          }
        }}
      );
      this.onStatusChange?.('✦ DEPTH MODEL PRONTO');
    } catch (e) {
      this.onStatusChange?.('✕ DEPTH MODEL FALHOU');
      console.error('[DepthScanner]', e);
    }
    this.loading = false;
  }

  async scanObject(
    video: HTMLVideoElement,
    obj: DetectedObject,
    spawnPos: THREE.Vector3
  ): Promise<THREE.Points | null> {
    if (!this.pipe) { await this.loadModel(); }
    if (!this.pipe) return null;

    this.onStatusChange?.('◌ CALCULANDO PROFUNDIDADE...');

    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;

    // Capturar frame ESPELHADO (como usuário vê)
    this.offscreen.width  = vw;
    this.offscreen.height = vh;
    this.offCtx.save();
    this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(video, -vw, 0, vw, vh);
    this.offCtx.restore();

    // BBOX já está em coordenadas espelhadas (conforme SceneAnalyzer)
    // ArLabels usa (1-obj.right) e (1-obj.left) para exibição
    // então a bbox original do detector está não-espelhada
    // Para recortar do canvas ESPELHADO, espelhar as coords:
    const mirLeft  = 1 - obj.right;
    const mirRight = 1 - obj.left;
    const cropX = Math.round(mirLeft * vw);
    const cropY = Math.round(obj.top  * vh);
    const cropW = Math.max(32, Math.round((mirRight - mirLeft) * vw));
    const cropH = Math.max(32, Math.round((obj.bottom - obj.top) * vh));

    const crop = document.createElement('canvas');
    crop.width  = cropW;
    crop.height = cropH;
    const cropCtx = crop.getContext('2d')!;
    cropCtx.drawImage(this.offscreen, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    try {
      const res = await (this.pipe as any)(crop.toDataURL('image/jpeg', 0.85));
      const depthData: Float32Array = res.predicted_depth.data;
      const dW = res.predicted_depth.dims[1];
      const dH = res.predicted_depth.dims[0];

      // Normalizar
      let dMin = Infinity, dMax = -Infinity;
      for (const v of depthData) { dMin = Math.min(dMin, v); dMax = Math.max(dMax, v); }
      const dRange = dMax - dMin || 1;

      // Cor do crop
      const colorData = cropCtx.getImageData(0, 0, cropW, cropH).data;

      // Point cloud
      const SKIP = 3;
      const positions: number[] = [];
      const colors: number[] = [];

      // Aspect ratio do objeto
      const objW = (obj.right - obj.left);
      const objH = (obj.bottom - obj.top);
      const scaleX = objW * 8;
      const scaleY = objH * 8;

      for (let dy = 0; dy < dH; dy += SKIP) {
        for (let dx = 0; dx < dW; dx += SKIP) {
          const di = dy * dW + dx;
          const depth = (depthData[di] - dMin) / dRange;

          const x = (dx / dW - 0.5) * scaleX;
          const y = -(dy / dH - 0.5) * scaleY;
          const z = depth * 1.8;

          positions.push(x, y, z);

          const px = Math.round((dx / dW) * cropW);
          const py = Math.round((dy / dH) * cropH);
          const pi = (py * cropW + px) * 4;
          colors.push(colorData[pi]/255, colorData[pi+1]/255, colorData[pi+2]/255);
        }
      }

      if (positions.length === 0) {
        this.onStatusChange?.('✕ SCAN VAZIO');
        return null;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 0.04,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geo, mat);
      // Posicionar onde o usuário clicou na cena
      points.position.copy(spawnPos);
      points.position.y += 0.5;
      points.userData.isScan = true;
      points.userData.label  = obj.label;

      this.scene.add(points);
      this.onStatusChange?.(`✦ ${obj.label.toUpperCase()} SCANEADO`);
      return points;

    } catch (e) {
      console.error('[DepthScanner]', e);
      this.onStatusChange?.('✕ FALHA NO SCAN');
      return null;
    }
  }
}
