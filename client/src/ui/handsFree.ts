// Hands-free voice mode: listen after each CEO reply and auto-submit transcriptions.

import { allowMic, cantListen } from './mic';

/** Reason hands-free mode cannot be enabled, or '' if OK. */
export function handsFreeProblem(ceoVoiceProvider: string): string {
  // Check insecure page first (common issue)
  const secureProblem = cantListen();
  if (secureProblem) return secureProblem;

  // Check if voice output is disabled
  if (ceoVoiceProvider === 'off') {
    return '🎧 To use hands-free, enable voice in the phone\'s Voice settings so the CEO\'s replies are spoken aloud.';
  }

  // Other issues will be caught when allowMic() is called
  return '';
}

/** Enable or disable hands-free mode after checking prerequisites. */
export async function setHandsFree(enabled: boolean, ceoVoiceProvider: string): Promise<{ ok: boolean; message: string }> {
  if (!enabled) {
    return { ok: true, message: '' };
  }

  const problem = handsFreeProblem(ceoVoiceProvider);
  if (problem) {
    return { ok: false, message: problem };
  }

  // Try to get microphone access
  const allowError = await allowMic();
  if (allowError) {
    return { ok: false, message: allowError };
  }

  // Check if browser has speech synthesis voices (for voice output)
  if (ceoVoiceProvider === 'browser' && (!speechSynthesis || speechSynthesis.getVoices().length === 0)) {
    return {
      ok: false,
      message: '🎧 This browser has no voices. Choose a different voice provider in Settings.',
    };
  }

  return { ok: true, message: '🎧 Hands-free on: after each reply, just talk.' };
}
