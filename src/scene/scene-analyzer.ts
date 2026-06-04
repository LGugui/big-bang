import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface DetectedObject {
  label: string;
  score: number;
  // Normalized bounding box [0..1]
  left: number; top: number; right: number; bottom: number;
}

export type SurfaceType = 'floor' | 'table' | 'wall' | 'sky' | 'person' | 'object' | 'air';

export interface SurfaceHit {
  type: SurfaceType;
  label?: string;
  confidence: number;
  floorY: number;  // Y position for object placement
}

const FLOOR_OBJECTS = new Set(['floor', 'carpet', 'rug', 'ground', 'road', 'pavement', 'mat']);
const WALL_OBJECTS  = new Set(['wall', 'door', 'window', 'curtain', 'painting', 'mirror', 'bookcase']);
const TABLE_OBJECTS = new Set(['table', 'desk', 'bench', 'counter', 'shelf', 'bed', 'dining table', 'coffee table', 'nightstand', 'countertop']);
const SKY_OBJECTS   = new Set(['sky', 'ceiling']);

// Height above floor-level for each surface type
const SURFACE_HEIGHT: Record<string, number> = {
  table: 1.0, 'dining table': 1.0, desk: 1.0, 'coffee table': 0.55,
  counter: 0.9, countertop: 0.9, shelf: 1.5, nightstand: 0.75, bench: 0.55, bed: 0.65,
  floor: 0, carpet: 0, rug: 0, ground: 0,
};

export class SceneAnalyzer {
  private detector: ObjectDetector | null = null;
  private objects: DetectedObject[] = [];
  private lastRun = 0;
  private intervalMs = 800;
  ready = false;

  async init(video: HTMLVideoElement): Promise<void> {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      this.detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
          delegate: 'GPU',
        },
        scoreThreshold: 0.45,
        maxResults: 12,
        runningMode: 'VIDEO',
      });
      this.ready = true;
      this.loop(video);
    } catch (e) {
      console.warn('[SceneAnalyzer] ObjectDetector indisponível:', e);
    }
  }

  private loop(video: HTMLVideoElement): void {
    if (!this.detector) return;
    const now = performance.now();
    if (now - this.lastRun > this.intervalMs && video.readyState >= 2) {
      const result = this.detector.detectForVideo(video, now);
      this.lastRun = now;
      this.objects = (result.detections ?? []).map(d => ({
        label: d.categories[0]?.categoryName ?? 'unknown',
        score: d.categories[0]?.score ?? 0,
        left:   d.boundingBox!.originX / video.videoWidth,
        top:    d.boundingBox!.originY / video.videoHeight,
        right: (d.boundingBox!.originX + d.boundingBox!.width)  / video.videoWidth,
        bottom:(d.boundingBox!.originY + d.boundingBox!.height) / video.videoHeight,
      }));
    }
    requestAnimationFrame(() => this.loop(video));
  }

  /** Retorna o tipo de superfície em coordenadas normalizadas [0..1] */
  getSurfaceAt(normX: number, normY: number): SurfaceHit {
    // Selfie-mirrored X
    const mx = 1 - normX;

    // Checar objetos detectados na posição
    for (const obj of this.objects) {
      if (mx >= obj.left && mx <= obj.right && normY >= obj.top && normY <= obj.bottom) {
        const h = SURFACE_HEIGHT[obj.label] ?? 0;
        if (obj.label === 'person') return { type: 'person', label: obj.label, confidence: obj.score, floorY: 0 };
        if (TABLE_OBJECTS.has(obj.label))  return { type: 'table',  label: obj.label, confidence: obj.score, floorY: h };
        if (WALL_OBJECTS.has(obj.label))   return { type: 'wall',   label: obj.label, confidence: obj.score, floorY: 0 };
        if (FLOOR_OBJECTS.has(obj.label))  return { type: 'floor',  label: obj.label, confidence: obj.score, floorY: h };
        if (SKY_OBJECTS.has(obj.label))    return { type: 'sky',    label: obj.label, confidence: obj.score, floorY: 0 };
        return { type: 'object', label: obj.label, confidence: obj.score, floorY: 0 };
      }
    }

    // Heurística por região da tela (sem detector ou fora de bbox)
    if (normY > 0.72) return { type: 'floor', confidence: 0.6, floorY: 0 };
    if (normY < 0.18) return { type: 'sky',   confidence: 0.5, floorY: 0 };
    if (normX < 0.08 || normX > 0.92) return { type: 'wall', confidence: 0.4, floorY: 0 };

    return { type: 'air', confidence: 0.3, floorY: 0 };
  }

  getObjects(): DetectedObject[] { return this.objects; }
}
