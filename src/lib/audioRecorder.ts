export interface RecordingResult {
  blob: Blob;
  durationSeconds: number;
}

const CANDIDATE_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

/** Wrapper chico sobre MediaRecorder para el mic del composer del chat: start() -> stop() (o cancel()). */
export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];

    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });

    this.startedAt = Date.now();
    this.recorder.start();
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("No hay grabación en curso"));
        return;
      }
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
          const durationSeconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
          this.releaseStream();
          resolve({ blob, durationSeconds });
        },
        { once: true }
      );
      recorder.stop();
    });
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.chunks = [];
    this.releaseStream();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
