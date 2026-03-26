/**
 * Linguist-Guardian — WebSocket Hook.
 *
 * Manages the WebSocket connection lifecycle:
 *   • Auto-connect on mount
 *   • Reconnection with exponential backoff
 *   • Message parsing and dispatch to callbacks
 *   • Send helpers for text and binary data
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const WS_BASE = `ws://${window.location.host}/ws`;
const MAX_RECONNECT_DELAY = 10000; // 10 seconds

export default function useWebSocket(sessionId, onMessage) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);

  // Store onMessage in a ref so connect() doesn't depend on its identity
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  /** Establish the WebSocket connection. */
  const connect = useCallback(() => {
    if (!sessionId) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = `${WS_BASE}/${sessionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      setLastError(null);
      reconnectDelay.current = 1000; // reset backoff
      console.log('[WS] Connected to', url);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        onMessageRef.current?.(message);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    ws.onerror = (event) => {
      console.error('[WS] Error:', event);
      setLastError('Connection error');
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      console.log('[WS] Closed:', event.code, event.reason);

      // Auto-reconnect with exponential backoff
      if (event.code !== 1000) {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(
            reconnectDelay.current * 2,
            MAX_RECONNECT_DELAY
          );
          connect();
        }, reconnectDelay.current);
      }
    };

    wsRef.current = ws;
  }, [sessionId]);

  /** Disconnect and clean up. */
  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  /** Send a JSON message. */
  const sendMessage = useCallback((type, data = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  /** Send binary audio data. */
  const sendAudio = useCallback((audioBlob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioBlob);
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    lastError,
    sendMessage,
    sendAudio,
    disconnect,
    reconnect: connect,
  };
}
