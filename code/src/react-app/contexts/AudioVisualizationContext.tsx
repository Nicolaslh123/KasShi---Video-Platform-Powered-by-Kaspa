import { createContext, useContext, useRef, useCallback, useState, type ReactNode } from 'react';

interface AudioVisualizationData {
  // Frequency data (0-255 for each bin)
  frequencyData: Uint8Array | null;
  // Pre-calculated intensities (0-1)
  bassIntensity: number;
  midIntensity: number;
  highIntensity: number;
  overallIntensity: number;
  // Is music actually playing?
  isPlaying: boolean;
  // Timestamp of last update
  lastUpdate: number;
}

interface BeatGridData {
  beatGrid: number[] | null;  // Pre-computed beat timestamps in seconds
  bpm: number | null;         // Detected tempo
  currentTime: number;        // Current playback time in seconds
}

interface AudioVisualizationContextType {
  // Current visualization data
  data: AudioVisualizationData;
  // Beat grid data for pre-computed beat sync
  beatData: BeatGridData;
  // Called by AudioPlayer to register its analyser node
  registerAnalyser: (analyser: AnalyserNode) => void;
  // Called by AudioPlayer to unregister
  unregisterAnalyser: () => void;
  // Called by AudioPlayer when play state changes
  setIsPlaying: (playing: boolean) => void;
  // Called by visualization components to get latest data
  getVisualizationData: () => AudioVisualizationData;
  // Called by AudioPlayer to update beat grid data
  setBeatGridData: (beatGrid: number[] | null, bpm: number | null) => void;
  // Called by AudioPlayer to update current playback time
  setCurrentTime: (time: number) => void;
  // Get beat data for visualizations
  getBeatData: () => BeatGridData;
}

const defaultData: AudioVisualizationData = {
  frequencyData: null,
  bassIntensity: 0,
  midIntensity: 0,
  highIntensity: 0,
  overallIntensity: 0,
  isPlaying: false,
  lastUpdate: 0,
};

const defaultBeatData: BeatGridData = {
  beatGrid: null,
  bpm: null,
  currentTime: 0,
};

const AudioVisualizationContext = createContext<AudioVisualizationContextType | null>(null);

export function AudioVisualizationProvider({ children }: { children: ReactNode }) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const [isPlaying, setIsPlayingState] = useState(false);
  const dataRef = useRef<AudioVisualizationData>({ ...defaultData });
  const beatDataRef = useRef<BeatGridData>({ ...defaultBeatData });

  const registerAnalyser = useCallback((analyser: AnalyserNode) => {
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
  }, []);

  const unregisterAnalyser = useCallback(() => {
    analyserRef.current = null;
    dataArrayRef.current = null;
    dataRef.current = { ...defaultData };
  }, []);

  const setIsPlaying = useCallback((playing: boolean) => {
    setIsPlayingState(playing);
    dataRef.current.isPlaying = playing;
  }, []);

  const setBeatGridData = useCallback((beatGrid: number[] | null, bpm: number | null) => {
    beatDataRef.current.beatGrid = beatGrid;
    beatDataRef.current.bpm = bpm;
  }, []);

  const setCurrentTime = useCallback((time: number) => {
    beatDataRef.current.currentTime = time;
  }, []);

  const getBeatData = useCallback((): BeatGridData => {
    return { ...beatDataRef.current };
  }, []);

  const getVisualizationData = useCallback((): AudioVisualizationData => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    // If no analyser connected, return zeros
    if (!analyser || !dataArray) {
      return {
        frequencyData: null,
        bassIntensity: 0,
        midIntensity: 0,
        highIntensity: 0,
        overallIntensity: 0,
        isPlaying: false,
        lastUpdate: Date.now(),
      };
    }

    // Get fresh frequency data - do this even if isPlaying is false
    // because on refresh, audio might be playing before the flag is set
    analyser.getByteFrequencyData(dataArray);
    
    // Check if there's actually audio data (sum of all frequencies)
    let totalEnergy = 0;
    for (let i = 0; i < dataArray.length; i++) {
      totalEnergy += dataArray[i];
    }
    const hasAudioData = totalEnergy > 100; // Some threshold to detect actual audio
    
    // If no audio data and not playing, return zeros
    if (!hasAudioData && !isPlaying) {
      return {
        frequencyData: null,
        bassIntensity: 0,
        midIntensity: 0,
        highIntensity: 0,
        overallIntensity: 0,
        isPlaying: false,
        lastUpdate: Date.now(),
      };
    }

    // Calculate frequency bin indices based on sample rate and fftSize
    // With fftSize=2048 and 44100 Hz: each bin = ~21.5 Hz
    // frequencyBinCount = fftSize/2 = 1024 bins
    const sampleRate = analyser.context.sampleRate || 44100;
    const binWidth = sampleRate / (dataArray.length * 2); // Hz per bin
    
    // Bass frequency range: 20-250 Hz (kicks, 808s, bass guitar fundamentals)
    const bassStartBin = Math.floor(20 / binWidth);
    const bassEndBin = Math.min(Math.floor(250 / binWidth), dataArray.length - 1);
    
    // Sub-bass for extra punch detection: 20-80 Hz
    const subBassEndBin = Math.min(Math.floor(80 / binWidth), dataArray.length - 1);
    
    // Mid frequency range: 250-4000 Hz
    const midStartBin = bassEndBin;
    const midEndBin = Math.min(Math.floor(4000 / binWidth), dataArray.length - 1);
    
    // High frequency range: 4000+ Hz
    const highStartBin = midEndBin;

    // Calculate bass intensity with emphasis on sub-bass for 808 detection
    let bassSum = 0;
    let bassMax = 0;
    let subBassMax = 0;
    for (let i = bassStartBin; i <= bassEndBin; i++) {
      bassSum += dataArray[i];
      if (dataArray[i] > bassMax) bassMax = dataArray[i];
      if (i <= subBassEndBin && dataArray[i] > subBassMax) {
        subBassMax = dataArray[i];
      }
    }
    const bassCount = bassEndBin - bassStartBin + 1;
    const bassAvg = bassSum / (bassCount * 255);
    const bassPeak = bassMax / 255;
    const subBassPeak = subBassMax / 255;
    // Weight sub-bass peaks moderately for smoother 808 detection
    const bassIntensity = bassAvg * 0.35 + bassPeak * 0.35 + subBassPeak * 0.3;

    // Calculate mids (250Hz - 4kHz)
    let midSum = 0;
    let midMax = 0;
    for (let i = midStartBin; i <= midEndBin; i++) {
      midSum += dataArray[i];
      if (dataArray[i] > midMax) midMax = dataArray[i];
    }
    const midCount = midEndBin - midStartBin + 1;
    const midAvg = midSum / (midCount * 255);
    const midPeak = midMax / 255;
    const midIntensity = midAvg * 0.5 + midPeak * 0.5;

    // Calculate highs (4kHz+)
    let highSum = 0;
    let highMax = 0;
    for (let i = highStartBin; i < dataArray.length; i++) {
      highSum += dataArray[i];
      if (dataArray[i] > highMax) highMax = dataArray[i];
    }
    const highCount = dataArray.length - highStartBin;
    const highAvg = highSum / (highCount * 255);
    const highPeak = highMax / 255;
    const highIntensity = highAvg * 0.6 + highPeak * 0.4;

    // Overall intensity weighted toward bass for reactive effects
    const overallIntensity = bassIntensity * 0.5 + midIntensity * 0.3 + highIntensity * 0.2;

    const result: AudioVisualizationData = {
      frequencyData: dataArray,
      bassIntensity,
      midIntensity,
      highIntensity,
      overallIntensity,
      isPlaying: isPlaying || hasAudioData, // True if either flag is set OR we detect audio
      lastUpdate: Date.now(),
    };

    dataRef.current = result;
    return result;
  }, [isPlaying]);

  return (
    <AudioVisualizationContext.Provider
      value={{
        data: dataRef.current,
        beatData: beatDataRef.current,
        registerAnalyser,
        unregisterAnalyser,
        setIsPlaying,
        getVisualizationData,
        setBeatGridData,
        setCurrentTime,
        getBeatData,
      }}
    >
      {children}
    </AudioVisualizationContext.Provider>
  );
}

export function useAudioVisualization() {
  const context = useContext(AudioVisualizationContext);
  if (!context) {
    // Return a dummy implementation if used outside provider
    return {
      data: defaultData,
      beatData: defaultBeatData,
      registerAnalyser: () => {},
      unregisterAnalyser: () => {},
      setIsPlaying: () => {},
      getVisualizationData: () => defaultData,
      setBeatGridData: () => {},
      setCurrentTime: () => {},
      getBeatData: () => defaultBeatData,
    };
  }
  return context;
}
