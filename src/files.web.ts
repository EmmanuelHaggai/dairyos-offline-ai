import type { ModelSlot } from './model-specs';
import { phoneRequest, phoneShell } from './phone-shell';
export type { ModelSlot } from './model-specs';
type State = Record<ModelSlot, { name: string; bytes: number } | null>;
let state: State = { text: null, vision: null, projection: null };
export function modelState() { return state; }
export async function refreshModels(): Promise<State> {
  if (phoneShell) { state = await phoneRequest<State>('models'); return state; }
  const response = await fetch('/api/models');
  if (!response.ok) throw new Error('Start the local desktop preview server to check model files.');
  state = await response.json();
  return state;
}
export async function importModel(_slot: ModelSlot) { throw new Error(phoneShell ? 'This iPhone pilot uses the verified model pack copied by USB. Tap Refresh files copied by USB after copying models into Documents/models.' : 'Desktop preview loads files from the project models folder. Use the model-staging script; iPhone builds import local GGUF files in this screen.'); }
