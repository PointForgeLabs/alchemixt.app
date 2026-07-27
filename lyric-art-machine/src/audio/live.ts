/**
 * Capturing audio from another browser tab.
 *
 * Chrome's tab-sharing is the only way a web page can legitimately hear a
 * YouTube video: the embedded player is cross-origin, so its audio can never
 * be routed into Web Audio directly. The user explicitly grants this per
 * session, per tab.
 *
 * The captured audio is recorded and then run through the same offline
 * analysis as a dropped file, so there is exactly one implementation of
 * "listening" rather than a second, weaker real-time one.
 */

export interface CaptureSession {
  /** Resolves with the recorded audio once `stop()` is called or sharing ends. */
  result: Promise<Blob>;
  stop(): void;
  /** Fires when the user ends sharing from the browser's own UI. */
  onEnded(callback: () => void): void;
}

export function tabCaptureSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === 'function'
    && typeof MediaRecorder !== 'undefined';
}

/** Picks a container the browser can both record and decode. */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export async function captureTabAudio(): Promise<CaptureSession> {
  if (!tabCaptureSupported()) {
    throw new Error('This browser cannot capture tab audio. Chrome or Edge can, or drop an audio file instead.');
  }

  let stream: MediaStream;
  try {
    // Chrome only offers the tab picker when video is requested too; the video
    // track is discarded immediately since only sound is wanted here.
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (error) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError';
    throw new Error(
      denied
        ? 'Screen sharing was declined, so there is nothing to listen to.'
        : 'Could not start tab capture in this browser.',
    );
  }

  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    for (const track of stream.getTracks()) track.stop();
    throw new Error(
      'That share included no audio. Pick a browser tab and tick "Also share tab audio".',
    );
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const endedCallbacks: (() => void)[] = [];
  const firstTrack = audioTracks[0] as MediaStreamTrack;

  const result = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('stop', () => {
      for (const track of stream.getTracks()) track.stop();
      const blob = new Blob(chunks, { type: mimeType ?? 'audio/webm' });
      if (blob.size === 0) {
        reject(new Error('No audio was captured. Make sure the tab was actually playing.'));
        return;
      }
      resolve(blob);
    });
    recorder.addEventListener('error', () => {
      for (const track of stream.getTracks()) track.stop();
      reject(new Error('Recording failed partway through.'));
    });
  });

  // The user can end sharing from Chrome's own banner rather than our button.
  firstTrack.addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop();
    for (const callback of endedCallbacks) callback();
  });

  recorder.start(1000);

  return {
    result,
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    onEnded: (callback) => endedCallbacks.push(callback),
  };
}
