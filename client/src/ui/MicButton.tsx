// 🎙️ Talk instead of type: hold to record, release to transcribe.

import { useEffect, useRef, useState } from 'react';
import { cantListen } from './mic';
import { MIC_WARMING, MIC_TIMEOUT_MS, MIC_TIMEOUT_MSG } from './micText';

export interface MicButtonProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const TAP_MS = 300; // Hold duration to activate recording (vs toggling listen mode)

export function MicButton({ disabled }: MicButtonProps) {
  const [state, setState] = useState<'ready' | 'warming' | 'listening' | 'error'>('ready');
  const [error, setError] = useState('');
  const [showTimeout, setShowTimeout] = useState(false);
  const holdStart = useRef<number | null>(null);
  const timeoutHandle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if mic access is forbidden
  const problem = cantListen();
  const micDisabled = !!problem;

  const cleanup = () => {
    if (timeoutHandle.current) {
      clearTimeout(timeoutHandle.current);
      timeoutHandle.current = null;
    }
    setShowTimeout(false);
  };

  // Show timeout message if warming takes too long
  const startTimeout = () => {
    cleanup();
    timeoutHandle.current = setTimeout(() => {
      setShowTimeout(true);
    }, MIC_TIMEOUT_MS);
  };

  const onMouseDown = () => {
    if (micDisabled || disabled) return;
    holdStart.current = Date.now();
    setState('warming');
    setError('');
    startTimeout();
  };

  const onMouseUp = () => {
    cleanup();
    const duration = holdStart.current ? Date.now() - holdStart.current : 0;
    holdStart.current = null;

    // For now, just reset state. A real implementation would start speech recognition here.
    if (duration >= TAP_MS) {
      setState('listening');
    } else {
      setState('ready');
    }
  };

  // const handleError = (err: string) => {
  //   cleanup();
  //   setError(err);
  //   setState('error');
  // };

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
    return cleanup;
  }, []);

  const isEnabled = !micDisabled && !disabled;
  const statusText =
    state === 'warming'
      ? showTimeout
        ? MIC_TIMEOUT_MSG
        : MIC_WARMING
      : state === 'listening'
        ? '🎙️ Listening…'
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
