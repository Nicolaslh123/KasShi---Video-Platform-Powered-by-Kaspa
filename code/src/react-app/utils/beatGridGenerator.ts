export interface BeatGridResult {
  beatGrid: number[]; // timestamps in seconds (e.g. [0.42, 0.85, 1.28, ...])
  bpm: number;
  confidence: number; // 0-1, higher = more reliable
  duration?: number;
  processingTimeMs?: number;
}

/**
 * Generates accurate beat grid from an audio file (client-side)
 * Uses Joe Sullivan / Beatport-style method optimized for electronic/808 music
 */
export async function generateBeatGridDirect(audioFile: File): Promise<BeatGridResult> {
  const startTime = Date.now();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  // Load file as ArrayBuffer
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const sampleRate = audioBuffer.sampleRate;

  // Use offline context with low-pass filter to isolate kicks/808s
  const offlineContext = new OfflineAudioContext(
    1,
    audioBuffer.length,
    sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;

  // Low-pass filter to isolate bass/808 range
  const filter = offlineContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;

  source.connect(filter);
  filter.connect(offlineContext.destination);
  source.start();

  const renderedBuffer = await offlineContext.startRendering();
  const data = renderedBuffer.getChannelData(0);

  // Core beat detection
  const peaks = getPeaksAtThreshold(data, 0.9, sampleRate);
  const intervals = countIntervalsBetweenNearbyPeaks(peaks, sampleRate);
  const { bpm, tempoConfidence } = groupNeighborsByTempo(intervals);

  // Convert peaks to timestamps (seconds) with minimum spacing filter
  const beatGrid = peaks
    .map(peakIndex => peakIndex / sampleRate)
    .filter((time, i, arr) => i === 0 || time - arr[i - 1] > 0.18); // minimum ~330 BPM spacing

  audioContext.close();

  return {
    beatGrid,
    bpm: Math.round(bpm),
    confidence: tempoConfidence,
    duration: audioBuffer.duration,
    processingTimeMs: Date.now() - startTime
  };
}

// Helper functions (battle-tested from Joe Sullivan's method)
function getPeaksAtThreshold(data: Float32Array, threshold: number, sampleRate: number): number[] {
  const peaks: number[] = [];
  let i = 0;
  const length = data.length;
  const skipSamples = Math.floor(sampleRate / 4); // Skip ~250ms forward after each peak

  while (i < length) {
    if (data[i] > threshold) {
      peaks.push(i);
      i += skipSamples;
    }
    i++;
  }
  return peaks;
}

function countIntervalsBetweenNearbyPeaks(peaks: number[], sampleRate: number): number[] {
  const intervals: number[] = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const interval = peaks[i + 1] - peaks[i];
    intervals.push(Math.round((interval / sampleRate) * 1000)); // ms
  }
  return intervals;
}

function groupNeighborsByTempo(intervals: number[]) {
  const tempoCounts: Map<number, number> = new Map();

  intervals.forEach((interval, i) => {
    for (let j = i + 1; j < Math.min(i + 10, intervals.length); j++) {
      const tempo = Math.round(60000 / ((intervals[j] + interval) / 2));
      if (tempo < 60 || tempo > 220) continue;

      tempoCounts.set(tempo, (tempoCounts.get(tempo) || 0) + 1);
    }
  });

  let bestTempo = 120;
  let maxCount = 0;

  tempoCounts.forEach((count, tempo) => {
    if (count > maxCount) {
      maxCount = count;
      bestTempo = tempo;
    }
  });

  const confidence = Math.min(1, maxCount / 30);

  return { bpm: bestTempo, tempoConfidence: confidence };
}
