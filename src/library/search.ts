/** Text folded for searching: no case, no accents ("forro" finds "Forró"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matches(text: string, query: string): boolean {
  return fold(text).includes(fold(query.trim()));
}

/** A folder's name from Android's tree URI (…/tree/primary%3AMusic%2Fforro_music → "forro_music"). */
export function folderName(tree: string): string {
  const id = decodeURIComponent(tree.split('/tree/')[1] ?? tree);
  return id.split(/[/:]/).filter(Boolean).pop() ?? 'Folder';
}
