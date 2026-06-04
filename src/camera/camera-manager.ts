export class CameraManager {
  private videoEl: HTMLVideoElement;
  private stream: MediaStream | null = null;

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  async start(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();
      return true;
    } catch (err) {
      console.warn('[CameraManager] Câmera não disponível:', err);
      return false;
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}
