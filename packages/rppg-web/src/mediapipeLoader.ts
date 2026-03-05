import type { FaceMeshLike } from './mediaPipeFaceFrameSource';

// Pin a known-good FaceMesh build instead of jsdelivr "latest" to avoid runtime asset mismatches.
// DEFAULT_ASSET_BASE: use a short /@0.4 pin to avoid brittle long SHAs during local dev.
// You can disable loading MediaPipe entirely by setting `window.__ELATA_DISABLE_FACEMESH = true` in the page.
const DEFAULT_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4';
const FACEMESH_SCRIPT_SELECTOR = 'script[data-elata-facemesh-loader="1"]';
let faceMeshScriptLoadPromise: Promise<void> | null = null;

// Try to load MediaPipe FaceMesh from a CDN if not already present on window
export async function loadFaceMesh(timeoutMs = 5000, assetBaseUrl: string = DEFAULT_ASSET_BASE): Promise<FaceMeshLike | null> {
  // Allow devs to opt-out of FaceMesh (useful when offline / testing) — avoids noisy console errors.
  const win = window as any;
  if (win.__ELATA_DISABLE_FACEMESH) return null;

  // If already available globally
  if (win.FaceMesh) {
    // Construct with default options
    const fm = new win.FaceMesh({ locateFile: (x: string) => locateAsset(x, assetBaseUrl) });
    if (typeof fm.initialize === 'function') await fm.initialize();
    return wrapFaceMesh(fm);
  }

  // Otherwise, insert script tag and wait
  const url = `${assetBaseUrl.replace(/\/+$/, '')}/face_mesh.js`;
  await ensureFaceMeshScript(url).catch(() => null);

  // Wait until global FaceMesh appears or timeout
  const start = Date.now();
  while (!(window as any).FaceMesh && Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }

  if ((window as any).FaceMesh) {
    const fm = new (window as any).FaceMesh({ locateFile: (x: string) => locateAsset(x, assetBaseUrl) });
    if (typeof fm.initialize === 'function') await fm.initialize();
    return wrapFaceMesh(fm);
  }

  return null;
}

async function ensureFaceMeshScript(url: string): Promise<void> {
  if ((window as any).FaceMesh) return;

  if (faceMeshScriptLoadPromise) {
    await faceMeshScriptLoadPromise;
    return;
  }

  const existing = (document.querySelector(FACEMESH_SCRIPT_SELECTOR) ||
    document.querySelector(`script[src="${url}"]`)) as HTMLScriptElement | null;
  if (existing) {
    // Another loader has already inserted the script. Let loadFaceMesh wait for global FaceMesh.
    return;
  }

  faceMeshScriptLoadPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.crossOrigin = 'anonymous';
    el.dataset.elataFacemeshLoader = '1';
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Failed to load FaceMesh script'));
    document.head.appendChild(el);
  }).finally(() => {
    faceMeshScriptLoadPromise = null;
  });

  await faceMeshScriptLoadPromise;
}

function locateAsset(file: string, base: string): string {
  if (!base) return file;
  // FaceMesh may pass absolute URLs for some assets.
  if (/^(?:https?:)?\/\//.test(file) || file.startsWith('data:') || file.startsWith('blob:')) return file;
  const normalizedBase = base.replace(/\/+$/, '');
  if (file.startsWith('/')) return `${normalizedBase}${file}`;
  return `${normalizedBase}/${file}`;
}

function wrapFaceMesh(fm: any): FaceMeshLike {
  // Provide minimal adapter: onResults setter and send({image})
  const adapter: FaceMeshLike = {
    set onResults(cb: (r: any) => void) {
      fm.onResults(cb);
    },
    send(opts: { image: HTMLVideoElement }) {
      fm.send({ image: opts.image });
    }
  } as unknown as FaceMeshLike;
  return adapter;
}
