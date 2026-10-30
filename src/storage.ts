import * as SQLite from 'expo-sqlite';
import type { FarmRecord, Reference, Turn } from './domain';
import { validateRecord } from './domain';

let opening: Promise<SQLite.SQLiteDatabase> | undefined;
export function database() {
  return opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync('dairyos-local.db');
    await db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, date TEXT NOT NULL, animal TEXT NOT NULL, quantity REAL, note TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (id INTEGER PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, createdAt TEXT NOT NULL, refs TEXT NOT NULL, photo INTEGER NOT NULL, elapsedMs INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reference_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, section TEXT NOT NULL, text TEXT NOT NULL, keywords TEXT NOT NULL);`);
    return db;
  })();
}
export async function getSetting(key: string) { return (await (await database()).getFirstAsync<{value: string}>('SELECT value FROM settings WHERE key=?', key))?.value; }
export async function setSetting(key: string, value: string) { await (await database()).runAsync('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }
export async function getRecords() { return (await database()).getAllAsync<FarmRecord>('SELECT * FROM records ORDER BY date DESC,id DESC'); }
export async function addRecord(input: Omit<FarmRecord, 'id'>) {
  const row = validateRecord(input);
  await (await database()).runAsync('INSERT INTO records(kind,date,animal,quantity,note) VALUES (?,?,?,?,?)', row.kind, row.date, row.animal, row.quantity, row.note);
}
export async function deleteRecord(id: number) { await (await database()).runAsync('DELETE FROM records WHERE id=?', id); }
export async function getTurns(): Promise<Turn[]> {
  const rows = await (await database()).getAllAsync<Omit<Turn, 'references' | 'photo'> & { refs: string; photo: number }>('SELECT * FROM turns ORDER BY id DESC LIMIT 40');
  return rows.reverse().map(row => ({ ...row, photo: Boolean(row.photo), references: JSON.parse(row.refs) }));
}
export async function saveTurn(turn: Omit<Turn, 'id'>) {
  await (await database()).runAsync('INSERT INTO turns(question,answer,createdAt,refs,photo,elapsedMs,status) VALUES (?,?,?,?,?,?,?)', turn.question, turn.answer, turn.createdAt, JSON.stringify(turn.references), Number(turn.photo), Math.round(turn.elapsedMs), turn.status);
}
export async function clearTurns() { await (await database()).runAsync('DELETE FROM turns'); }
export async function getNotes(): Promise<Reference[]> {
  const rows = await (await database()).getAllAsync<Omit<Reference, 'keywords'> & {keywords: string}>('SELECT * FROM reference_notes ORDER BY title');
  return rows.map(row => ({ ...row, keywords: JSON.parse(row.keywords) }));
}
export async function addNote(title: string, text: string) {
  if (!title.trim() || !text.trim() || title.length > 100 || text.length > 4000) throw new Error('Use a title under 100 characters and a note under 4,000 characters.');
  const id = 'local-' + Date.now().toString(36);
  await (await database()).runAsync('INSERT INTO reference_notes(id,title,source,section,text,keywords) VALUES (?,?,?,?,?,?)', id, title.trim(), 'User-provided local note; not independently verified', 'Local note', text.trim(), '[]');
}
export async function deleteNote(id: string) { await (await database()).runAsync('DELETE FROM reference_notes WHERE id=?', id); }
