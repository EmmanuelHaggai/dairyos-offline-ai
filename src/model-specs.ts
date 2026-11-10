// Local model pack is pinned by revision, byte size and SHA-256 in models/manifest.json.
export const modelNames = { text: 'text-qwen3-4b-q3.gguf', vision: 'vision-flash.gguf', projection: 'vision-flash-mmproj.gguf' } as const;
export type ModelSlot = keyof typeof modelNames;
export const expectedModelBytes: Record<ModelSlot, number> = { text: 2075618016, vision: 303143488, projection: 108782144 };
