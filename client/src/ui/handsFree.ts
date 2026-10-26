// Hands-free voice mode: listen after each CEO reply and auto-submit transcriptions.

import { allowMic, cantListen } from './mic';
import { micErrorLine } from './micText';

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

const LISTEN_TIMEOUT_MS = 30000; // 30 second timeout for speech recognition

interface ListenSession {
  aborted: boolean;
  recognition: any | null;
  stream: MediaStream | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

// Track active listening sessions to enable cancellation
const activeSessions = new Set<ListenSession>();

/**
 * Start listening for voice input and return the recognized text, or reject on error.
 * Ensures only one transcript is sent per session and respects abort signals.
 */
export async function listenForVoice(abortSignal?: AbortSignal): Promise<string> {
  const session: ListenSession = {
    aborted: false,
    recognition: null,
    stream: null,
    timeoutHandle: null,
  };

  activeSessions.add(session);

  // Handle external abort
  const abortHandler = () => {
    session.aborted = true;
  };
  abortSignal?.addEventListener('abort', abortHandler);

  try {
    // Check prerequisites first (does not acquire stream)
    const problem = handsFreeProblem('browser');
    if (problem) {
      throw new Error(problem);
    }

    // Request microphone access
    session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Initialize speech recognition
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      session.stream.getTracks().forEach((track) => track.stop());
      throw new Error('Speech Recognition API not available');
    }

    session.recognition = new SpeechRecognition();
    session.recognition.continuous = false;
    session.recognition.interimResults = true;
    session.recognition.lang = 'en-US';

    return new Promise((resolve, reject) => {
      let finalTranscript = '';
      let settled = false;

      const cleanup = () => {
        settled = true;
        if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
        if (session.stream) {
          session.stream.getTracks().forEach((track) => track.stop());
        }
        if (session.recognition) {
          try {
            session.recognition.abort();
          } catch {
            // Already stopped
          }
        }
      };

      const safeResolve = (value: string) => {
        if (!settled && !session.aborted) {
          settled = true;
          cleanup();
          resolve(value);
        }
      };

      const safeReject = (error: Error) => {
        if (!settled && !session.aborted) {
          settled = true;
          cleanup();
          reject(error);
        }
      };

      // Set timeout to prevent indefinite hanging
      session.timeoutHandle = setTimeout(() => {
        safeReject(new Error('🎧 Listening timeout. No speech detected in time.'));
      }, LISTEN_TIMEOUT_MS);

      session.recognition.onstart = () => {
        // Listening started
      };

      session.recognition.onresult = (event: any) => {
        if (session.aborted) return;

        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
      };

      session.recognition.onerror = (event: any) => {
        safeReject(new Error(micErrorLine(event.error)));
      };

      session.recognition.onend = () => {
        const text = finalTranscript.trim();
        if (text) {
          safeResolve(text);
        } else {
          safeReject(new Error('🎧 No speech detected. Try again.'));
        }
      };

      session.recognition.start();
    });
  } catch (e) {
    // Ensure cleanup on any error
    if (session.stream) {
      session.stream.getTracks().forEach((track) => track.stop());
    }
    if (session.recognition) {
      try {
        session.recognition.abort();
      } catch {
        // Already stopped
      }
    }
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(err.includes('🎙️') || err.includes('🎧') ? err : micErrorLine(err));
  } finally {
    abortSignal?.removeEventListener('abort', abortHandler);
    activeSessions.delete(session);
  }
}

/** Abort all active listening sessions. Used for cleanup on unmount/navigation. */
export function abortAllListening(): void {
  for (const session of activeSessions) {
    session.aborted = true;
    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle);
    }
    if (session.stream) {
      session.stream.getTracks().forEach((track) => track.stop());
    }
    if (session.recognition) {
      try {
        session.recognition.abort();
      } catch {
        // Already stopped
      }
    }
  }
  activeSessions.clear();
}

/** Enable or disable hands-free mode after checking prerequisites. */
export async function setHandsFree(enabled: boolean, ceoVoiceProvider: string): Promise<{ ok: boolean; message: string }> {
  if (!enabled) {
    abortAllListening();
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
