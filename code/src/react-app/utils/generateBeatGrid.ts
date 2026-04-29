export interface BeatGridResult {
  success: boolean;
  beatGrid: number[];
  bpm: number;
  duration: number;
}

export async function generateBeatGrid(file: File): Promise<BeatGridResult> {
  return new Promise((resolve, reject) => {
    // Use pure JS beat detection worker (no WASM required)
    const worker = new Worker(new URL('../workers/beatGridWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.success) resolve(e.data);
      else reject(new Error(e.data.error || 'Beat analysis failed'));
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage(file);
  });
}
