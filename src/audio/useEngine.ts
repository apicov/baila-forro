import { useEffect, useState, useSyncExternalStore } from 'react';
import { MixEngine } from './engine';

/** One engine for the app: it outlives the pages, so a song keeps playing on the way back to the library. */
export const engine = new MixEngine();

/** The engine, re-rendering on its changes (song loaded, play/pause, a track switched). */
export function useEngine(): MixEngine {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}

/** The playback time, updated a few times a second while playing. */
export function usePlaybackTime(everyMs = 100): number {
  const e = useEngine();
  const [time, setTime] = useState(e.time);
  useEffect(() => {
    setTime(e.time);
    if (!e.playing) return;
    const id = setInterval(() => setTime(e.time), everyMs);
    return () => clearInterval(id);
  }, [e, e.playing, e.version, everyMs]);
  return time;
}
