/**
 * Decoding audio into something analyzable.
 *
 * Everything is decoded at a reduced sample rate: musical features live well
 * below 11 kHz, and halving the rate halves the FFT work for a four-minute
 * track. `decodeAudioData` resamples to the context's rate natively, so this
 * costs nothing extra.
 */

const ANALYSIS_RATE = 22050;

export const SUPPORTED_HINT = 'MP3, WAV, M4A, FLAC, OGG, or WebM';

/** Browsers vary in what they'll decode, so failure needs a readable message. */
export async function decodeToBuffer(data: ArrayBuffer): Promise<AudioBuffer> {
  // A 1-frame context exists only to host decodeAudioData at our chosen rate.
  const context = new OfflineAudioContext(1, 1, ANALYSIS_RATE);
  try {
    return await context.decodeAudioData(data);
  } catch {
    throw new Error(
      `This browser could not decode that file. Try ${SUPPORTED_HINT}.`,
    );
  }
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  return decodeToBuffer(await blob.arrayBuffer());
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  if (file.size === 0) throw new Error('That file is empty.');
  // 200 MB is far beyond any song and well past what decoding can hold.
  if (file.size > 200 * 1024 * 1024) {
    throw new Error('That file is too large to decode in a browser tab.');
  }
  return decodeToBuffer(await file.arrayBuffer());
}
