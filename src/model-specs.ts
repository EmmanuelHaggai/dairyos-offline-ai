// Pilot pack pinned to the QVAC 0.22.0 catalog; the staging script verifies SHA-256.
export const modelNames = { text: 'text.gguf', vision: 'vision-flash.gguf', projection: 'vision-flash-mmproj.gguf' } as const;
export type ModelSlot = keyof typeof modelNames;
export const expectedModelBytes: Record<ModelSlot, number> = { text: 1280835840, vision: 303143488, projection: 108782144 };
