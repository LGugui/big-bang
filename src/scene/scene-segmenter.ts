import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache  = true;

export interface SegmentLabel {
  label: string;
  score: number;
  // Bounding box of centroid region, normalized [0..1]
  cx: number; cy: number;
}

type SegPipeline = Awaited<ReturnType<typeof pipeline>>;

// ADE20K surface/structure labels we care about
const SURFACE_LABELS = new Set([
  'wall','floor','ceiling','sky','building','door','window',
  'table','chair','sofa','bed','cabinet','desk',
  'person','plant','tree','grass','water','road','sidewalk',
  'rug','carpet','curtain','pillow','screen','television','monitor',
  'refrigerator','stove','microwave','sink','toilet','bathtub','lamp',
  'book','bottle','cup','bowl','bag',
]);

export class SceneSegmenter {
  private pipe: SegPipeline | null = null;
  private loading = false;
  private offscreen = document.createElement('canvas');
  private offCtx = this.offscreen.getContext('2d')!;
  labels: SegmentLabel[] = [];
  ready = false;
  onStatusChange?: (msg: string) => void;

  async init(): Promise<void> {
    if (this.pipe || this.loading) return;
    this.loading = true;
    this.onStatusChange?.('◌ CARREGANDO SEGMENTADOR...');
    try {
      this.pipe = await pipeline(
        'image-segmentation',
        'Xenova/segformer-b0-finetuned-ade-512-512',
        { progress_callback: (p: any) => {
          if (p.status === 'downloading') {
            const pct = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : '?';
            this.onStatusChange?.(`◌ SEGMENTADOR ${pct}%`);
          }
        }}
      );
      this.ready = true;
      this.onStatusChange?.('✦ SEGMENTADOR PRONTO');
    } catch (e) {
      console.warn('[SceneSegmenter]', e);
      this.onStatusChange?.('✕ SEGMENTADOR ERRO');
    }
    this.loading = false;
  }

  async analyzeFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.pipe || !video.videoWidth) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    this.offscreen.width  = 256; // downsample for speed
    this.offscreen.height = Math.round(256 * vh / vw);
    this.offCtx.save();
    this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(video, -256, 0, 256, this.offscreen.height);
    this.offCtx.restore();

    try {
      const result: any[] = await (this.pipe as any)(this.offscreen.toDataURL('image/jpeg', 0.7));
      this.labels = result
        .filter(r => SURFACE_LABELS.has(r.label) && r.score > 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(r => ({
          label: r.label,
          score: r.score,
          cx: this.maskCentroid(r.mask, 'x'),
          cy: this.maskCentroid(r.mask, 'y'),
        }));
    } catch (e) { /* silent */ }
  }

  private maskCentroid(mask: any, axis: 'x' | 'y'): number {
    // mask is a binary array of size [H, W]
    if (!mask?.data) return 0.5;
    const data = mask.data as Uint8ClampedArray;
    const W = mask.width ?? 256;
    const H = mask.height ?? (data.length / W);
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0) {
        sum += axis === 'x' ? (i % W) / W : Math.floor(i / W) / H;
        count++;
      }
    }
    return count > 0 ? sum / count : 0.5;
  }

  /** Returns what surface type is at a given normalized (x, y) */
  getSurfaceAt(nx: number, ny: number): string {
    const mx = 1 - nx; // mirror
    let best = '';
    let bestDist = 0.4; // max radius to match
    for (const lbl of this.labels) {
      const d = Math.hypot(lbl.cx - mx, lbl.cy - ny);
      if (d < bestDist) { bestDist = d; best = lbl.label; }
    }
    return best || (ny > 0.7 ? 'floor' : ny < 0.2 ? 'ceiling' : 'wall');
  }
}
