import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createIndexedDbAdapter,
  createMetricsHost,
  type MetricsHost,
  type StorageAdapter,
} from '@elata-biosciences/app-metrics/host';
import { APP_ID, DEMO_WALLET_ADDRESS } from '../shared/handshake';

/**
 * The host shell is what the appstore would be in production. It owns
 * IndexedDB and hands the sandboxed iframe a transferred MessagePort.
 *
 * This shell is dev-only — when you run `npm run build:zip`, only the
 * iframe app (game.html) gets packaged for upload.
 */
export default function HostApp() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hostRef = useRef<MetricsHost | null>(null);
  const adapterRef = useRef<StorageAdapter | null>(null);
  const [status, setStatus] = useState<'booting' | 'ready' | 'error'>('booting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const adapter = createIndexedDbAdapter();
      adapterRef.current = adapter;
      const host = createMetricsHost({
        iframe,
        appId: APP_ID,
        walletAddress: DEMO_WALLET_ADDRESS,
        storage: adapter,
      });
      host.start();
      hostRef.current = host;
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    return () => {
      hostRef.current?.stop();
      hostRef.current = null;
    };
  }, []);

  const handleWipe = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    await adapter.clearScope(DEMO_WALLET_ADDRESS, APP_ID);
    // Force iframe to reload so it sees an empty leaderboard.
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  return (
    <div className="host-shell">
      <header className="host-header">
        <h1>Pulse-game host shell</h1>
        <p className="host-subtitle">
          You are looking at the appstore shell. The boxed area below is a sandboxed
          iframe — the actual app. It talks to this shell over a transferred
          MessagePort; storage lives here, not in the app.
        </p>
        <div className="host-status">
          <span className={`status-dot ${status}`} />
          <span>
            {status === 'booting' && 'Booting host…'}
            {status === 'ready' && `Host ready · scope (${shorten(DEMO_WALLET_ADDRESS)}, ${APP_ID})`}
            {status === 'error' && `Host error: ${errorMessage ?? 'unknown'}`}
          </span>
          <button type="button" className="wipe-button" onClick={handleWipe}>
            Wipe demo data
          </button>
        </div>
      </header>

      <div className="iframe-frame">
        <iframe
          ref={iframeRef}
          title="pulse-game sandboxed app"
          src="/game.html"
          allow="camera"
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleIframeLoad}
          className="game-iframe"
        />
      </div>

      <footer className="host-footer">
        <p>
          The host’s only job here is: create the adapter, instantiate{' '}
          <code>createMetricsHost</code>, and call <code>host.start()</code> once
          the iframe loads. Everything else — rPPG, the game, the leaderboard
          read — happens inside the iframe.
        </p>
      </footer>
    </div>
  );
}

function shorten(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
