import { useEffect, useRef, useState } from 'react';
import { Chip, Stack, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { REASONS, RHYTHMS, type Reason, type Review, type Rhythm, type SongRow, setTags } from '@/library/db';
import { REASON_LABEL, RHYTHM_LABEL, VERDICT_LABEL } from '@/library/tags';

const NOTE_DELAY_MS = 800;

/** A song's tags, one tap each: its general rhythm, and whether what the app shows looks right (or what needs a
 *  fix). Tapping the chosen one again clears it. */
export function SongTags({ song }: { song: SongRow }) {
  const [rhythm, setRhythm] = useState<Rhythm | null>(song.rhythm ?? null);
  const [review, setReview] = useState<Review | null>(song.review ?? null);
  const noteTimer = useRef<{ timer: ReturnType<typeof setTimeout>; review: Review } | null>(null);

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
    <Stack spacing={1} sx={{ mb: 2 }}>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="Rhythm">
        {RHYTHMS.map((r) => (
          <Chip key={r} label={RHYTHM_LABEL[r]} size="small" color={rhythm === r ? 'primary' : 'default'}
            variant={rhythm === r ? 'filled' : 'outlined'} aria-pressed={rhythm === r} onClick={() => pickRhythm(r)} />
        ))}
      </Stack>
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
    </Stack>
  );
}
