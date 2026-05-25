import { useEffect, useRef, useState } from 'react';
import {
  createMetricsClient,
  type AppRecord,
  type AppScore,
  type MetricsClient,
} from '@elata-biosciences/app-metrics';

export type MetricsState =
  | { status: 'connecting' }
  | { status: 'ready'; client: MetricsClient }
  | { status: 'error'; message: string };

export function useMetricsClient(): MetricsState {
  const clientRef = useRef<MetricsClient | null>(null);
  const [state, setState] = useState<MetricsState>({ status: 'connecting' });

  useEffect(() => {
    const client = createMetricsClient();
    clientRef.current = client;
    client
      .ready()
      .then(() => setState({ status: 'ready', client }))
      .catch((err: Error) =>
        setState({
          status: 'error',
          message: err.message || 'Metrics host handshake failed.',
        }),
      );
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  return state;
}

export type { AppRecord, AppScore, MetricsClient };
