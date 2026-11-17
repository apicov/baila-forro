/** The footwork clicks, made live from the beat grid (what `<song>_clicks.mp3` holds, rendered the same way:
 *  one and two a soft ~900 Hz tick, three a louder ~2 kHz accent, the pause silent). Made live, an edited
 *  step is heard the next time it comes round. */
import { type Beat, type Role, lowerBound } from '@/beats/model';

const SOUND: Record<Exclude<Role, 0>, { freq: number; gain: number }> = {
  1: { freq: 900, gain: 0.45 },
  2: { freq: 900, gain: 0.45 },
  3: { freq: 2000, gain: 1 },
};

/** The steps to click in [from, to): pauses left out. */
export function clicksInWindow(beats: Beat[], from: number, to: number): Beat[] {
  const out: Beat[] = [];
  for (let i = lowerBound(beats, from); i < beats.length && beats[i].t < to; i++) {
    if (beats[i].role !== 0) out.push(beats[i]);
  }
  return out;
}

/** One click at context time `when`. The node is returned so a pause can cancel it before it sounds. */
export function playClick(ctx: BaseAudioContext, dest: AudioNode, when: number, role: Exclude<Role, 0>): OscillatorNode {
  const { freq, gain } = SOUND[role];
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(gain, when + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  osc.connect(env).connect(dest);
  osc.start(when);
  osc.stop(when + 0.05);
  return osc;
}
