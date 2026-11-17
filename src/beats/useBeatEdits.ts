/** The open song's steps as the editor changes them: an undo stack, the engine's clicks kept on the latest
 *  version, and the edits saved to the library a moment after the last change. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { engine } from '@/audio/useEngine';
import { saveEdits, type SongRow } from '@/library/db';
import { type Beat, parse } from './model';

const SAVE_DELAY_MS = 800;
const UNDO_DEPTH = 200;

export function songBeats(song: SongRow): Beat[] {
  return song.beatsEdited ?? (song.beatsOriginal ? parse(song.beatsOriginal) : []);
}

export function useBeatEdits(song: SongRow) {
  const [beats, setBeats] = useState<Beat[]>(() => (engine.songId === song.id ? engine.beats : songBeats(song)));
  const [edited, setEdited] = useState(song.beatsEdited !== null);
  const [undoDepth, setUndoDepth] = useState(0);
  const latest = useRef(beats);
  const undoStack = useRef<Beat[][]>([]);
  // what to save (null: back to the original) and when
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; beats: Beat[] | null } | null>(null);

  const flush = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    void saveEdits(song.id, pending.current.beats);
    pending.current = null;
  }, [song.id]);

  useEffect(() => flush, [flush]); // leaving the page saves what's pending

  const show = useCallback((next: Beat[], save: Beat[] | null) => {
    latest.current = next;
    setBeats(next);
    engine.setBeats(next);
    setEdited(save !== null);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { timer: setTimeout(flush, SAVE_DELAY_MS), beats: save };
  }, [flush]);

  const pushUndo = () => {
    undoStack.current = [...undoStack.current.slice(-UNDO_DEPTH + 1), latest.current];
    setUndoDepth(undoStack.current.length);
  };

  /** Applies an edit. `snapshot: false` for the moves of a drag after its first (one undo step per drag). */
  const apply = useCallback((edit: (b: Beat[]) => Beat[], snapshot = true) => {
    if (snapshot) pushUndo();
    const next = edit(latest.current);
    show(next, next);
  }, [show]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (prev) show(prev, prev);
  }, [show]);

  const revert = useCallback(() => {
    pushUndo();
    show(song.beatsOriginal ? parse(song.beatsOriginal) : [], null);
  }, [show, song.beatsOriginal]);

  return { beats, latest, apply, undo, canUndo: undoDepth > 0, revert, edited };
}
