"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  DesktopTransport,
  ConnectionState,
  DesktopBackendEndpoint,
  EventHandler,
} from "../services/desktop-transport";

export interface UseDesktopTransportResult {
  connectionState: ConnectionState;
  endpoint: DesktopBackendEndpoint | null;
  sendCommand: <TResult = unknown, TParams = unknown>(
    name: string,
    params?: TParams,
    timeoutMs?: number
  ) => Promise<TResult>;
  onEvent: <T = unknown>(event: string, handler: EventHandler<T>) => () => void;
  reconnect: () => Promise<void>;
  disconnect: () => void;
}

export function useDesktopTransport(): UseDesktopTransportResult {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [endpoint, setEndpoint] = useState<DesktopBackendEndpoint | null>(null);
  const transportRef = useRef<DesktopTransport | null>(null);

  useEffect(() => {
    const transport = new DesktopTransport({ autoConnect: true });
    transportRef.current = transport;

    const unsub = transport.onStateChange((state) => {
      setConnectionState(state);
      setEndpoint(transport.getEndpoint());
    });

    return () => {
      unsub();
      transport.disconnect();
      transportRef.current = null;
    };
  }, []);

  const sendCommand = useCallback(
    async <TResult = unknown, TParams = unknown>(
      name: string,
      params?: TParams,
      timeoutMs?: number
    ): Promise<TResult> => {
      if (!transportRef.current) {
        throw new Error("DesktopTransport is not initialized");
      }
      return transportRef.current.sendCommand<TResult, TParams>(
        name,
        params,
        timeoutMs
      );
    },
    []
  );

  const onEvent = useCallback(
    <T = unknown>(event: string, handler: EventHandler<T>): (() => void) => {
      if (!transportRef.current) {
        return () => {};
      }
      return transportRef.current.on<T>(event, handler);
    },
    []
  );

  const reconnect = useCallback(async (): Promise<void> => {
    if (transportRef.current) {
      await transportRef.current.connect();
    }
  }, []);

  const disconnect = useCallback((): void => {
    if (transportRef.current) {
      transportRef.current.disconnect();
    }
  }, []);

  return {
    connectionState,
    endpoint,
    sendCommand,
    onEvent,
    reconnect,
    disconnect,
  };
}
