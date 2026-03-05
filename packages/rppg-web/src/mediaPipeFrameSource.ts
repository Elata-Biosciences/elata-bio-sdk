import { FrameSource, Frame } from './frameSource';

type Options = { fps?: number };

export class MediaPipeFrameSource implements FrameSource {
  public onFrame: ((frame: Frame) => void) | null = null;
  private running = false;
  private timer: any = null;
  private vfcHandle: number | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(private video: HTMLVideoElement, private opts: Options = {}) {
    // create an offscreen canvas
    this.canvas = (document.createElement('canvas') as HTMLCanvasElement);
    this.canvas.width = video.videoWidth || (video as any).width || 320;
    this.canvas.height = video.videoHeight || (video as any).height || 240;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const fps = this.opts.fps || 30;
    const interval = 1000 / fps;
    const vfc = (this.video as any).requestVideoFrameCallback;
    if (typeof vfc === 'function') {
      const cb = (now: number, metadata: any) => {
        if (!this.running) return;
        this.captureFrame(now, metadata);
        this.vfcHandle = (this.video as any).requestVideoFrameCallback(cb);
      };
      this.vfcHandle = (this.video as any).requestVideoFrameCallback(cb);
    } else {
      this.timer = setInterval(() => this.captureFrame(Date.now(), null), interval);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const cancel = (this.video as any).cancelVideoFrameCallback;
    if (this.vfcHandle !== null && typeof cancel === 'function') {
      cancel.call(this.video, this.vfcHandle);
      this.vfcHandle = null;
    }
  }

  private captureFrame(now?: number, metadata?: any) {
    try {
      this.ctx.drawImage(this.video as CanvasImageSource, 0, 0, this.canvas.width, this.canvas.height);
      const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const ts = typeof metadata?.mediaTime === 'number' ? metadata.mediaTime * 1000 : (now ?? Date.now());
      const frame: Frame = { data: img.data, width: this.canvas.width, height: this.canvas.height, timestampMs: ts };
      if (this.onFrame) this.onFrame(frame);
    } catch (e) {
      // swallow errors during capture (video not ready, etc.)
    }
  }
}
