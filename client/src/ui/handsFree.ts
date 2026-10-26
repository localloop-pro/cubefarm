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

/** Start listening for voice input and return the recognized text, or reject on error. */
export async function listenForVoice(): Promise<string> {
  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Initialize speech recognition
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Speech Recognition API not available');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    return new Promise((resolve, reject) => {
      let finalTranscript = '';

      recognition.onstart = () => {
        // Listening started
      };

      recognition.onresult = (event: any) => {
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

      recognition.onerror = (event: any) => {
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error(micErrorLine(event.error)));
      };

      recognition.onend = () => {
        stream.getTracks().forEach((track) => track.stop());
        const text = finalTranscript.trim();
        if (text) {
          resolve(text);
        } else {
          reject(new Error('🎧 No speech detected. Try again.'));
        }
      };

      recognition.start();
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(micErrorLine(err));
  }
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
