// alphaTab's player threads: imported inside a worker, alphaTab sets up its
// synthesizer; inside an audio worklet, its audio output. One file serves
// both, built by Vite as one minified script with no imports
// (docs/adr/0015).
import '@coderline/alphatab';
