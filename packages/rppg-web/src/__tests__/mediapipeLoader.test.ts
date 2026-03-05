import { loadFaceMesh } from '../mediapipeLoader';

type FaceMeshCtorOpts = {
  locateFile: (file: string) => string;
};

describe('mediapipeLoader', () => {
  const originalFaceMesh = (window as any).FaceMesh;
  const originalDisable = (window as any).__ELATA_DISABLE_FACEMESH;

  afterEach(() => {
    (window as any).FaceMesh = originalFaceMesh;
    (window as any).__ELATA_DISABLE_FACEMESH = originalDisable;
    jest.restoreAllMocks();
    document.head.querySelectorAll('script[data-elata-facemesh-loader="1"]').forEach((el) => el.remove());
  });

  test('builds robust locateFile urls for relative, absolute, and root-prefixed files', async () => {
    let capturedOpts: FaceMeshCtorOpts | null = null;
    const onResults = jest.fn();
    const send = jest.fn();
    (window as any).FaceMesh = function FaceMeshMock(opts: FaceMeshCtorOpts) {
      capturedOpts = opts;
      return { onResults, send };
    };

    const fm = await loadFaceMesh(10, 'https://cdn.example.com/face_mesh/');
    expect(fm).not.toBeNull();
    expect(capturedOpts).not.toBeNull();

    const locate = capturedOpts!.locateFile;
    expect(locate('face_mesh_solution_packed_assets_loader.js')).toBe(
      'https://cdn.example.com/face_mesh/face_mesh_solution_packed_assets_loader.js'
    );
    expect(locate('/face_mesh_solution_simd_wasm_bin.wasm')).toBe(
      'https://cdn.example.com/face_mesh/face_mesh_solution_simd_wasm_bin.wasm'
    );
    expect(locate('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/asset.data')).toBe(
      'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/asset.data'
    );
    expect(locate('blob:https://example.com/some-id')).toBe('blob:https://example.com/some-id');
    expect(locate('data:application/octet-stream;base64,AAAA')).toBe(
      'data:application/octet-stream;base64,AAAA'
    );
  });

  test('concurrent loads inject only one script tag', async () => {
    const appendSpy = jest
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node: Node) => {
        const script = node as HTMLScriptElement;
        (window as any).FaceMesh = function FaceMeshMock() {
          return { onResults: () => {}, send: () => {} };
        };
        script.onload?.(new Event('load'));
        return node;
      });

    delete (window as any).FaceMesh;
    const [a, b] = await Promise.all([loadFaceMesh(200), loadFaceMesh(200)]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  test('__ELATA_DISABLE_FACEMESH flag returns null immediately', async () => {
    (window as any).__ELATA_DISABLE_FACEMESH = true;
    (window as any).FaceMesh = function () { throw new Error('should not be called'); };

    const result = await loadFaceMesh(100);
    expect(result).toBeNull();
  });

  test('script load failure still resolves without crashing', async () => {
    delete (window as any).FaceMesh;

    jest.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const script = node as HTMLScriptElement;
      setTimeout(() => script.onerror?.(new Event('error') as any), 0);
      return node;
    });

    const result = await loadFaceMesh(50);
    // Script failed and FaceMesh never appeared → returns null after timeout
    expect(result).toBeNull();
  });

  test('timeout expires when FaceMesh never appears on window', async () => {
    delete (window as any).FaceMesh;

    jest.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const script = node as HTMLScriptElement;
      script.onload?.(new Event('load'));
      return node;
    });

    const start = Date.now();
    const result = await loadFaceMesh(200);
    const elapsed = Date.now() - start;

    expect(result).toBeNull();
    // Should have waited approximately timeoutMs before giving up
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });
});
