import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { localModelPath } from './domain';
import { expectedModelBytes, modelNames, type ModelSlot } from './model-specs';

export type { ModelSlot } from './model-specs';
export function modelFile(slot: ModelSlot) { return new File(Paths.document, 'models', modelNames[slot]); }
export function modelState() {
  return Object.fromEntries((Object.keys(modelNames) as ModelSlot[]).map(slot => {
    const file = modelFile(slot);
    return [slot, file.exists ? { name: file.name, bytes: file.size } : null];
  })) as Record<ModelSlot, { name: string; bytes: number } | null>;
}
export async function refreshModels() { return modelState(); }
export function assertGGUF(file: File) {
  if (!file.exists || file.size < 1024 || file.size > 4_000_000_000) throw new Error('Choose a complete GGUF model smaller than 4 GB.');
  const handle = file.open();
  try {
    const bytes = handle.readBytes(4);
    if (String.fromCharCode(...bytes) !== 'GGUF') throw new Error('This file is not a GGUF model.');
  } finally { handle.close(); }
}
export async function importModel(slot: ModelSlot) {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return false;
  const asset = picked.assets[0];
  if (!asset) return false;
  const incoming = new File(asset.uri);
  try {
    localModelPath(incoming.uri);
    assertGGUF(incoming);
    if (incoming.size !== expectedModelBytes[slot]) throw new Error(`This pilot expects the pinned ${slot} model pack. Choose the complete verified model from this computer.`);
    const directory = new Directory(Paths.document, 'models');
    directory.create({ intermediates: true, idempotent: true });
    const staged = new File(directory, 'incoming-' + modelNames[slot]);
    if (staged.exists) staged.delete();
    incoming.copy(staged);
    assertGGUF(staged);
    const destination = modelFile(slot);
    if (destination.exists) destination.delete();
    staged.move(destination);
    return true;
  } finally {
    // DocumentPicker made a cache copy; remove only that copy, never a farmer's original.
    if (incoming.uri.startsWith(Paths.cache.uri) && incoming.exists) incoming.delete();
  }
}

export function validateModelFiles(photo: boolean) {
  const slots: ModelSlot[] = photo ? ['text', 'vision', 'projection'] : ['text'];
  for (const slot of slots) {
    const file = modelFile(slot);
    if (!file.exists) throw new Error(`Add the ${slot} model in Setup before using ${photo ? 'photo guidance' : 'chat'}.`);
    assertGGUF(file);
    if (file.size !== expectedModelBytes[slot]) throw new Error(`The ${slot} model is incomplete or from a different pack. Finish copying the verified file in Setup.`);
  }
}

// No registry constants/URLs are used during inference. This file is read by QVAC at worker startup.
export function writeRuntimeConfig() {
  const file = new File(Paths.document, 'qvac.config.json');
  file.write(JSON.stringify({ loggerLevel: 'error', loggerConsoleOutput: false, cacheDirectory: new Directory(Paths.document, 'qvac-cache').uri.replace('file://', '') }));
}
