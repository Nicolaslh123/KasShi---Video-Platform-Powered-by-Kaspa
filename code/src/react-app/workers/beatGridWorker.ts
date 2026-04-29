// Simple + Reliable beat detection using Web Audio API
// Focuses on 808s and kicks with low-pass filtering

self.onmessage = async (e: MessageEvent<File>) => {
  const file = e.data;

  try {
    const audioContext = new (self.AudioContext || (self as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Strong low-pass for 808/kick focus
    const offline = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;

    const filter = offline.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;

    source.connect(filter);
    filter.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);

    const peaks = getPeaks(data, 0.82);
    const beatGrid: number[] = [];

    for (let i = 0; i < peaks.length; i++) {
      const time = Number((peaks[i] / audioBuffer.sampleRate).toFixed(3));
      if (i === 0 || time - beatGrid[beatGrid.length - 1] > 0.18) {
        beatGrid.push(time);
      }
    }

    // Simple BPM estimate
    let bpm = 128;
    if (beatGrid.length > 8) {
      const intervals = [];
      for (let i = 1; i < beatGrid.length; i++) {
        intervals.push(beatGrid[i] - beatGrid[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      bpm = Math.round(60 / avg);
    }

    self.postMessage({
      success: true,
      beatGrid,
      bpm: Math.max(70, Math.min(200, bpm)),
      duration: audioBuffer.duration
    });
  } catch (err: any) {
    self.postMessage({ success: false, error: err.message });
  }
};

function getPeaks(data: Float32Array, threshold: number): number[] {
  const peaks: number[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] > threshold) {
      peaks.push(i);
      i += Math.floor(44100 * 0.22); // ~220ms skip to avoid double hits
    }
    i++;
  }
  return peaks;
}
