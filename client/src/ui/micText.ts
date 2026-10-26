// Friendly error messages for microphone and speech recognition issues.

import { cantListen } from './mic';

/** Map a speech recognition error or exception type to a user-friendly message. */
export function micErrorLine(error: string | Error): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();

  // Insecure page issues
  if (msg === 'TypeError' || lowerMsg.includes('typeerror') || lowerMsg.includes('mediadevices')) {
    return cantListen() || '🎙️ Microphone is not available.';
  }
  if (msg === 'SecurityError' || lowerMsg.includes('securityerror')) {
    return cantListen() || '🎙️ Microphone access denied by browser security policy.';
  }
  if (msg === 'not-allowed' || lowerMsg.includes('permission') || lowerMsg.includes('denied')) {
    return "🎙️ Microphone blocked. Allow it in the address bar's permission icon.";
  }

  // Other standard errors
  if (lowerMsg.includes('no-speech')) {
    return '🎙️ No speech detected. Try again.';
  }
  if (lowerMsg.includes('network')) {
    return '🎙️ Network error. Check your connection.';
  }

  // Generic fallback
  return `🎙️ Listening stopped (${msg || 'unknown error'}).`;
}

/** Message shown while waiting for the microphone to initialize. */
export const MIC_WARMING = 'Starting the mic…';

/** Delay before showing the longer "waiting for permission prompt" message (ms). */
export const MIC_TIMEOUT_MS = 2000;

/** Message shown if the mic is still warming after MIC_TIMEOUT_MS. */
export const MIC_TIMEOUT_MSG = 'Waiting for the browser\'s microphone prompt… (check the address bar)';

/** Delay before dismissing a mic status message and falling back to error (ms). */
export const MIC_STATUS_CLEANUP_MS = 3000;
