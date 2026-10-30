import { localModelPath } from './domain';
import { modelFile, validateModelFiles, writeRuntimeConfig } from './files';
import { runInference } from './engine';
export { stopInference, isBusy } from './engine';
export function answerQuestion(options: Omit<Parameters<typeof runInference>[0], 'paths' | 'prepare' | 'loadSDK' | 'device'>) {
  return runInference({ ...options,
    paths: { text: localModelPath(modelFile('text').uri), vision: localModelPath(modelFile('vision').uri), projection: localModelPath(modelFile('projection').uri) },
    prepare: () => { validateModelFiles(!!options.photoPath); writeRuntimeConfig(); },
  });
}
