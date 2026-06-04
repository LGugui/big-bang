import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { HandFrame } from './ws-hand-client';

export class BrowserHandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private lastTs = -1;
  private running = false;
  onFrame?: (frame: HandFrame) => void;
  onReady?: () => void;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      numHands: 2,
      runningMode: 'VIDEO',
    });

    this.running = true;
    this.onReady?.();
    this.loop();
  }

  private loop = (): void => {
    if (!this.running || !this.landmarker) return;

    if (this.video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== this.lastTs) {
        const result = this.landmarker.detectForVideo(this.video, ts);
        this.lastTs = ts;

        if (result.landmarks.length > 0 && this.onFrame) {
          const frame: HandFrame = {
            hands: result.landmarks.map((lm, i) => ({
              label: result.handedness[i]?.[0]?.categoryName ?? 'Right',
              landmarks: lm.map(p => ({ x: p.x, y: p.y, z: p.z })),
            })),
          };
          this.onFrame(frame);
        } else if (this.onFrame) {
          this.onFrame({ hands: [] });
        }
      }
    }

    requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.running = false;
    this.landmarker?.close();
  }
}
