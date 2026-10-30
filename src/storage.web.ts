import type { FarmRecord, Reference, Turn } from './domain';
import { validateRecord } from './domain';
import { phoneShell } from './phone-shell';

const prefix = phoneShell ? ((window as Window & { dairyosTest?: boolean }).dairyosTest ? 'dairyos-phone-test-v1:' : 'dairyos-phone-v1:') : 'dairyos-preview-v1:';
function read<T>(key: string, initial: T): T { const value = localStorage.getItem(prefix + key); return value ? JSON.parse(value) as T : initial; }
function write(key: string, value: unknown) { localStorage.setItem(prefix + key, JSON.stringify(value)); }
function id() { const next = read('sequence', 0) + 1; write('sequence', next); return next; }
export async function getSetting(key: string) { return read<string | undefined>('setting:' + key, undefined); }
export async function setSetting(key: string, value: string) { write('setting:' + key, value); }
export async function getRecords() { return read<FarmRecord[]>('records', []).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id); }
export async function addRecord(input: Omit<FarmRecord, 'id'>) { const row = validateRecord(input); write('records', [...await getRecords(), { ...row, id: id() }]); }
export async function deleteRecord(recordId: number) { write('records', (await getRecords()).filter(row => row.id !== recordId)); }
export async function getTurns() { return read<Turn[]>('turns', []).slice(-40); }
export async function saveTurn(turn: Omit<Turn, 'id'>) { write('turns', [...await getTurns(), { ...turn, id: id() }]); }
export async function clearTurns() { write('turns', []); }
export async function getNotes() { return read<Reference[]>('notes', []); }
export async function addNote(title: string, text: string) {
  if (!title.trim() || !text.trim() || title.length > 100 || text.length > 4000) throw new Error('Use a title under 100 characters and a note under 4,000 characters.');
  write('notes', [...await getNotes(), { id: 'local-' + id(), title: title.trim(), text: text.trim(), source: 'User-provided local note; not independently verified', section: 'Local note', keywords: [] }]);
}
export async function deleteNote(noteId: string) { write('notes', (await getNotes()).filter(row => row.id !== noteId)); }
