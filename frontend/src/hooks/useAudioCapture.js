/**
 * Linguist-Guardian — Audio Capture Hook.
 *
 * Uses the MediaRecorder API to capture microphone audio and
 * stream it as chunks for WebSocket transmission.
 *
 * Features:
 *   • Start/stop recording
 *   • Chunk streaming at configurable intervals (default 2s)
 *   • Returns audio blobs for WS transmission
 */

import { useCallback, useRef, useState } from 'react';

const DEFAULT_CHUNK_INTERVAL = 2000; // 2 seconds

export default function useAudioCapture(onAudioChunk, chunkInterval = DEFAULT_CHUNK_INTERVAL) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  /** Start capturing audio from the microphone. */
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder with webm/opus codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          onAudioChunk?.(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('[Audio] Recording error:', event.error);
        setError('Recording error');
        stopRecording();
      };

      // Start recording with chunk interval
      recorder.start(chunkInterval);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      console.log('[Audio] Recording started');
    } catch (err) {
      console.error('[Audio] Failed to start recording:', err);
      setError(err.message || 'Microphone access denied');
      setIsRecording(false);
    }
  }, [onAudioChunk, chunkInterval]);

  /** Stop recording and release the microphone. */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    setIsRecording(false);
    console.log('[Audio] Recording stopped');
  }, []);

  /** Toggle recording on/off. */
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
