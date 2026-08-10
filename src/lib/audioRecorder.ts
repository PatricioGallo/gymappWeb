export interface RecordingResult {
  blob: Blob;
  durationSeconds: number;
}

const CANDIDATE_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

/** Nivel de volumen (0 a 1, RMS) leído de un AnalyserNode. Se usa tanto al grabar como al reproducir, para animar la onda tipo WhatsApp en los dos casos. */
export function readLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  return Math.min(1, rms * 4);
}

/** Wrapper chico sobre MediaRecorder para el mic del composer del chat: start() -> stop() (o cancel()). */
export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Uint8Array | null = null;

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

    // Analizador aparte del MediaRecorder: no afecta la grabación, solo se usa
    // para leer el nivel de volumen en vivo y dibujar la onda tipo WhatsApp.
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.6;
    source.connect(this.analyser);
    this.levelData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /** Nivel de volumen actual (0 a 1, RMS), para animar la onda mientras se graba. */
  getLevel(): number {
    if (!this.analyser || !this.levelData) return 0;
    return readLevel(this.analyser, this.levelData as Uint8Array<ArrayBuffer>);
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
    void this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.levelData = null;
  }
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
