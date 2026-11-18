/** The words for a song's tags, on screen and in the search. */
import type { Reason, Rhythm, SongRow } from './db';

export const RHYTHM_LABEL: Record<Rhythm, string> = { 'forró': 'Forró', 'arrasta-pé': 'Arrasta-pé', 'baião': 'Baião', 'xaxado': 'Xaxado' };
export const REASON_LABEL: Record<Reason, string> = { steps: 'Steps', rhythm: 'Rhythm', audio: 'Audio' };
export const VERDICT_LABEL = { right: 'Looks right', fix: 'Needs a fix' } as const;

/** What the search looks in: the title and the tags ("needs a fix", "arrasta", "not checked", "no rhythm"…). */
export function searchText(s: SongRow): string {
  const review = s.review
    ? `${VERDICT_LABEL[s.review.verdict]} ${s.review.reasons.map((r) => REASON_LABEL[r]).join(' ')} ${s.review.note}`
    : 'not checked';
  return `${s.title} · ${s.rhythm ? RHYTHM_LABEL[s.rhythm] : 'no rhythm'} · ${review}`;
}
