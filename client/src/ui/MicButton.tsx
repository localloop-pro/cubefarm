// 🎙️ Talk instead of type: hold to record, release to transcribe.

import { useEffect, useRef, useState } from 'react';
import { cantListen } from './mic';
import { micErrorLine, MIC_WARMING, MIC_TIMEOUT_MS, MIC_TIMEOUT_MSG, MIC_STATUS_CLEANUP_MS } from './micText';

export interface MicButtonProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const TAP_MS = 300; // Hold duration to activate recording (vs toggling listen mode)

export function MicButton({ value, onChange, disabled }: MicButtonProps) {
  const [state, setState] = useState<'ready' | 'warming' | 'listening' | 'processing' | 'error'>('ready');
  const [error, setError] = useState('');
  const [showTimeout, setShowTimeout] = useState(false);
  const holdStart = useRef<number | null>(null);
  const timeoutHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Check if mic access is forbidden
  const problem = cantListen();
  const micDisabled = !!problem;

  const cleanup = () => {
    if (timeoutHandle.current) {
      clearTimeout(timeoutHandle.current);
      timeoutHandle.current = null;
    }
    if (statusHandle.current) {
      clearTimeout(statusHandle.current);
      statusHandle.current = null;
    }
    setShowTimeout(false);
  };

  const cleanupMic = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Already stopped or not started
      }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Show timeout message if warming takes too long
  const startTimeout = () => {
    cleanup();
    timeoutHandle.current = setTimeout(() => {
      setShowTimeout(true);
    }, MIC_TIMEOUT_MS);
  };

  const handleError = (err: string) => {
    cleanup();
    cleanupMic();
    setError(err);
    setState('error');
    statusHandle.current = setTimeout(() => {
      setState('ready');
      setError('');
    }, MIC_STATUS_CLEANUP_MS);
  };

  const startRecognition = async () => {
    try {
      // Request microphone access
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize speech recognition
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) {
        handleError(micErrorLine('Speech Recognition API not available'));
        return;
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      let finalTranscript = '';

      recognitionRef.current.onstart = () => {
        setState('listening');
      };

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        // Could show interim results, but for now we just capture final
      };

      recognitionRef.current.onerror = (event: any) => {
        handleError(micErrorLine(event.error));
      };

      recognitionRef.current.onend = () => {
        cleanupMic();
        if (finalTranscript.trim()) {
          setState('processing');
          onChange(value + (value && !value.endsWith(' ') ? ' ' : '') + finalTranscript.trim());
          setState('ready');
        } else {
          setState('ready');
        }
      };

      recognitionRef.current.start();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      handleError(micErrorLine(err));
    }
  };

  const onMouseDown = () => {
    if (micDisabled || disabled) return;
    holdStart.current = Date.now();
    setState('warming');
    setError('');
    startTimeout();
    void startRecognition();
  };

  const onMouseUp = () => {
    cleanup();
    const duration = holdStart.current ? Date.now() - holdStart.current : 0;
    holdStart.current = null;

    if (recognitionRef.current && state === 'listening') {
      recognitionRef.current.stop();
    } else if (duration < TAP_MS) {
      setState('ready');
      cleanupMic();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      onMouseDown();
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onMouseUp();
    }
  };

  useEffect(() => {
    return () => {
      cleanup();
      cleanupMic();
    };
  }, []);

  const isEnabled = !micDisabled && !disabled;
  const statusText =
    state === 'warming'
      ? showTimeout
        ? MIC_TIMEOUT_MSG
        : MIC_WARMING
      : state === 'listening'
        ? '🎙️ Listening…'
        : state === 'processing'
          ? '🎙️ Processing…'
          : state === 'error'
            ? error || 'Error'
            : '';

  return (
    <div className="mic-button-group">
      <button
        type="button"
        className={`mic-btn ${isEnabled ? '' : 'mic-cant'}`}
        disabled={disabled}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        title={problem || 'Hold to record voice input (Space bar also works)'}
        aria-label="Talk instead of type"
        aria-pressed={state !== 'ready'}
      >
        🎙️
      </button>
      {statusText && <div className="mic-status">{statusText}</div>}
    </div>
  );
}
