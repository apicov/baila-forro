import { useEffect, useRef, useState } from 'react';
import { Chip, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { REASONS, RHYTHMS, type Reason, type Review, type Rhythm, type SongRow, setTags } from '@/library/db';
import { REASON_LABEL, RHYTHM_LABEL, VERDICT_LABEL } from '@/library/tags';
import { songKey } from '@/library/importSongs';
import { isSetUp, loadSharing, refreshSoon, useGroup } from '@/library/sync';

const NOTE_DELAY_MS = 800;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line of the group's view: its votes once you gave yours, else how many there are. */
function GroupLine({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2" color="text.secondary" component="div">{children}</Typography>;
}

/** A song's tags, one tap each: its general rhythm, and whether what the app shows looks right (or what needs a
 *  fix). Tapping the chosen one again clears it. */
export function SongTags({ song, onChange }: { song: SongRow; onChange?: (tags: { rhythm: Rhythm | null; review: Review | null }) => void }) {
  const [rhythm, setRhythm] = useState<Rhythm | null>(song.rhythm ?? null);
  const [review, setReview] = useState<Review | null>(song.review ?? null);
  useEffect(() => { onChange?.({ rhythm, review }); }, [rhythm, review, onChange]);
  const noteTimer = useRef<{ timer: ReturnType<typeof setTimeout>; review: Review } | null>(null);
  const shared = isSetUp(loadSharing());
  const g = useGroup()[songKey(song.id)];
  useEffect(() => { if (shared) refreshSoon(); }, [shared, song.id]); // this song's votes as fresh as can be

  const flushNote = () => {
    if (!noteTimer.current) return;
    clearTimeout(noteTimer.current.timer);
    void setTags(song.id, { review: noteTimer.current.review });
    noteTimer.current = null;
  };
  useEffect(() => { // leaving the page saves the note being typed
    const pending = noteTimer;
    return () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      void setTags(song.id, { review: pending.current.review });
      pending.current = null;
    };
  }, [song.id]);

  const pickRhythm = (r: Rhythm) => {
    const next = r === rhythm ? null : r;
    setRhythm(next);
    void setTags(song.id, { rhythm: next });
  };
  const saveReview = (next: Review | null) => {
    if (noteTimer.current) { clearTimeout(noteTimer.current.timer); noteTimer.current = null; }
    setReview(next);
    void setTags(song.id, { review: next });
  };
  const pickVerdict = (v: Review['verdict'] | null) => {
    if (!v) return saveReview(null);
    saveReview(v === 'fix' ? { verdict: 'fix', reasons: review?.reasons ?? [], note: review?.note ?? '' } : { verdict: 'right', reasons: [], note: '' });
  };
  const toggleReason = (r: Reason) => {
    if (review?.verdict !== 'fix') return;
    saveReview({ ...review, reasons: review.reasons.includes(r) ? review.reasons.filter((x) => x !== r) : REASONS.filter((x) => x === r || review.reasons.includes(x)) });
  };
  const typeNote = (note: string) => {
    if (review?.verdict !== 'fix') return;
    const next = { ...review, note };
    setReview(next);
    if (noteTimer.current) clearTimeout(noteTimer.current.timer);
    noteTimer.current = { timer: setTimeout(flushNote, NOTE_DELAY_MS), review: next };
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="Rhythm">
        {RHYTHMS.map((r) => (
          <Chip key={r} label={RHYTHM_LABEL[r]} size="small" color={rhythm === r ? 'primary' : 'default'}
            variant={rhythm === r ? 'filled' : 'outlined'} aria-pressed={rhythm === r} onClick={() => pickRhythm(r)} />
        ))}
      </Stack>
      {shared && (
        <GroupLine>
          {g?.rhythms ? (
            <>Group: {Object.entries(g.rhythms).sort((a, b) => b[1]! - a[1]!).map(([r, n], i, all) => (
              <span key={r}>{i > 0 && ' · '}{i === 0 && (all.length === 1 || n! > all[1][1]!) // a clear leader: bold
                ? <b>{RHYTHM_LABEL[r as Rhythm] ?? r} {n}</b> : `${RHYTHM_LABEL[r as Rhythm] ?? r} ${n}`}</span>
            ))}</>
          ) : rhythm ? 'Sharing your vote…'
            : g?.rhythm_votes ? `${plural(g.rhythm_votes, 'vote', 'votes')} in the group: tag the rhythm to see them`
              : 'No rhythm votes in the group yet'}
        </GroupLine>
      )}
      <ToggleButtonGroup size="small" exclusive value={review?.verdict ?? null} onChange={(_, v) => pickVerdict(v)} aria-label="Review">
        <ToggleButton value="right" color="success"><CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />{VERDICT_LABEL.right}</ToggleButton>
        <ToggleButton value="fix" color="warning"><ReportProblemIcon fontSize="small" sx={{ mr: 0.5 }} />{VERDICT_LABEL.fix}</ToggleButton>
      </ToggleButtonGroup>
      {review?.verdict === 'fix' && (
        <>
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="What needs a fix">
            {REASONS.map((r) => (
              <Chip key={r} label={REASON_LABEL[r]} size="small" color={review.reasons.includes(r) ? 'warning' : 'default'}
                variant={review.reasons.includes(r) ? 'filled' : 'outlined'} aria-pressed={review.reasons.includes(r)}
                onClick={() => toggleReason(r)} />
            ))}
          </Stack>
          <TextField size="small" placeholder="What's wrong? (optional)" value={review.note} onChange={(e) => typeNote(e.target.value)}
            onBlur={flushNote} slotProps={{ htmlInput: { maxLength: 500, 'aria-label': 'Note' } }} />
        </>
      )}
      {shared && (
        <GroupLine>
          {g?.review ? (
            <>
              Group: ✓ {g.review.right} · ⚠ {g.review.fix}
              {Object.keys(g.review.reasons).length > 0 && ` (${Object.entries(g.review.reasons).map(([r, n]) => `${REASON_LABEL[r as Reason] ?? r} ${n}`).join(', ')})`}
              {g.review.notes.filter((x) => !x.mine).map((x) => <div key={x.name + x.note}><b>{x.name}:</b> {x.note}</div>)}
            </>
          ) : review ? 'Sharing your review…'
            : g?.reviews ? `${plural(g.reviews, 'review', 'reviews')} in the group: give yours to see them`
              : 'No reviews in the group yet'}
        </GroupLine>
      )}
    </Stack>
  );
}
