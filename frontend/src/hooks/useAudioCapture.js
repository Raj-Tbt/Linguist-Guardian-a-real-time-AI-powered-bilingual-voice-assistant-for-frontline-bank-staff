/**
 * Linguist-Guardian â€” Audio Capture Hook (Press-to-Talk).
 *
 * Captures microphone audio as a SINGLE complete blob.
 * Audio is collected while the user holds the mic button,
 * then sent as ONE blob when recording stops.
 *
 * This prevents the auto-message bug where chunk-streaming
 * triggered a new STT response every 2 seconds.
 */

import { useCallback, useRef, useState } from 'react';

export default function useAudioCapture(onAudioComplete) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  /** Start capturing audio from the microphone. */
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

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

      // Collect chunks into array (don't send them yet)
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // When recording stops, combine all chunks into ONE blob and send
      recorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const completeBlob = new Blob(chunksRef.current, { type: mimeType });
          console.log('[Audio] Complete recording:', completeBlob.size, 'bytes');
          if (completeBlob.size > 100) {
            onAudioComplete?.(completeBlob);
          }
        }
        chunksRef.current = [];
      };

      recorder.onerror = (event) => {
        console.error('[Audio] Recording error:', event.error);
        setError('Recording error');
        stopRecording();
      };

      // Start recording â€” collect data in 500ms intervals (internal only)
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      console.log('[Audio] Recording started');
    } catch (err) {
      console.error('[Audio] Failed to start recording:', err);
      setError(err.message || 'Microphone access denied');
      setIsRecording(false);
    }
  }, [onAudioComplete]);

  /** Stop recording, combine audio, and send ONE blob. */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // triggers onstop â†’ sends combined blob
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
