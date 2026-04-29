// Main thread beat grid analyzer - no web worker needed
// Focused on 808s and kicks with low-pass filtering

export async function analyzeBeatGrid(file: File): Promise<{
  beatGrid: number[];
  bpm: number;
}> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Low-pass filter focused on 808s
    const offline = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;

    const filter = offline.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 165;

    source.connect(filter);
    filter.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);

    const peaks: number[] = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] > 0.78) {
        peaks.push(i);
        i += Math.floor(audioBuffer.sampleRate * 0.22); // ~220ms skip
      }
      i++;
    }

    const beatGrid: number[] = [];
    for (const peak of peaks) {
      const time = Number((peak / audioBuffer.sampleRate).toFixed(3));
      if (beatGrid.length === 0 || time - beatGrid[beatGrid.length - 1] > 0.18) {
        beatGrid.push(time);
      }
    }

    // BPM estimation
    let bpm = 128;
    if (beatGrid.length > 6) {
      const intervals = [];
      for (let j = 1; j < beatGrid.length; j++) {
        intervals.push(beatGrid[j] - beatGrid[j - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      bpm = Math.round(60 / avgInterval);
    }

    return {
      beatGrid,
      bpm: Math.max(70, Math.min(200, bpm))
    };
  } finally {
    audioContext.close();
  }
}
