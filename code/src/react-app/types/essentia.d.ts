declare module 'essentia.js' {
  export default class Essentia {
    constructor(wasmModule: any);
    arrayToVector(array: Float32Array): any;
    BeatTrackerMultiFeature(signal: any, maxTempo?: number, minTempo?: number): { beats: Float32Array };
    TempoTap(beats: Float32Array, sampleRate: number): { tempo: number };
    delete(): void;
  }
}

declare module 'essentia.js/dist/essentia-wasm.web.js' {
  export const EssentiaWASM: any;
}
