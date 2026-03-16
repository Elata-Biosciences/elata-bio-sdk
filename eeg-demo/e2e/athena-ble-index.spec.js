const { test, expect } = require("@playwright/test");

const SERVICE_UUID = "0000fe8d-0000-1000-8000-00805f9b34fb";
const CHAR_UUIDS = {
	command: "273e0001-4c4d-454d-96be-f03bac821358",
	athenaEeg: "273e0013-4c4d-454d-96be-f03bac821358",
	athenaOther: "273e0014-4c4d-454d-96be-f03bac821358",
};

function wasmStubModuleSource() {
	return `
export default async function init() {
  return undefined;
}

export function get_version() {
  return "test";
}

export function band_powers() {
  return { delta: 1, theta: 1, alpha: 1, beta: 1, gamma: 1 };
}

export function alpha_power() {
  return 1;
}

export function beta_power() {
  return 1;
}

export function theta_power() {
  return 1;
}

class BaseModel {
  process() {
    return null;
  }
}

export class WasmAlphaBumpDetector extends BaseModel {}
export class WasmAlphaPeakModel extends BaseModel {}
export class WasmCalmnessModel extends BaseModel {}

export class AthenaWasmDecoder {
  constructor() {
    window.__athenaTest.decoder.constructed += 1;
  }

  set_use_device_timestamps(enabled) {
    window.__athenaTest.decoder.useDeviceTimestamps = !!enabled;
  }

  set_clock_kind(kind) {
    window.__athenaTest.decoder.clockKind = kind;
  }

  set_reorder_window_ms(ms) {
    window.__athenaTest.decoder.reorderWindowMs = ms;
  }

  reset() {
    window.__athenaTest.decoder.resetCalls += 1;
  }

  decode(payload) {
    if (payload) {
      window.__athenaTest.decoder.decodePayloadSizes.push(payload.length || 0);
    }
    window.__athenaTest.decoder.decodeCalls += 1;
    return {
      eeg_samples: [
        1, 2, 3, 4, 5, 6, 7, 8,
        9, 10, 11, 12, 13, 14, 15, 16
      ],
      eeg_timestamps_ms: [1000, 1004],
      eeg_channel_count: 8,
      accgyro_samples: [],
      accgyro_timestamps_ms: [],
      optics_samples: [10, 11, 12, 20, 21, 22],
      optics_timestamps_ms: [1000, 1016],
      optics_channel_count: 3,
      battery_samples: [],
      battery_timestamps_ms: []
    };
  }
}
`;
}

test("Athena BLE path in index.html is covered by an automated browser test", async ({
	page,
}) => {
	await page.route("**/pkg/eeg_wasm.js", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/javascript; charset=utf-8",
			body: wasmStubModuleSource(),
		});
	});

	await page.addInitScript(
		({ serviceUuid, charUuids }) => {
			const state = {
				requestDeviceCalls: 0,
				requestOptions: null,
				commands: [],
				notificationStarts: [],
				decoder: {
					constructed: 0,
					useDeviceTimestamps: null,
					clockKind: null,
					reorderWindowMs: null,
					resetCalls: 0,
					decodeCalls: 0,
					decodePayloadSizes: [],
				},
			};
			window.__athenaTest = state;

			class FakeCharacteristic {
				constructor(uuid, opts = {}) {
					this.uuid = uuid.toLowerCase();
					this.value = new DataView(new Uint8Array([0]).buffer);
					this.listeners = new Map();
					this.emitOnSubscribe = !!opts.emitOnSubscribe;
					this.isCommand = !!opts.isCommand;
				}

				async startNotifications() {
					state.notificationStarts.push(this.uuid);
					return this;
				}

				async stopNotifications() {
					return this;
				}

				addEventListener(type, handler) {
					const handlers = this.listeners.get(type) || [];
					handlers.push(handler);
					this.listeners.set(type, handlers);

					if (type === "characteristicvaluechanged" && this.emitOnSubscribe) {
						const payload = new Uint8Array([44, 1, 2, 3, 4, 5, 6, 7]);
						this.value = new DataView(payload.buffer);
						setTimeout(() => handler({ target: this }), 0);
					}
				}

				removeEventListener(type, handler) {
					const handlers = this.listeners.get(type) || [];
					this.listeners.set(
						type,
						handlers.filter((entry) => entry !== handler),
					);
				}

				async writeValueWithoutResponse(value) {
					this.#recordCommand(value);
				}

				async writeValue(value) {
					this.#recordCommand(value);
				}

				#recordCommand(value) {
					const bytes =
						value instanceof Uint8Array
							? value
							: new Uint8Array(value.buffer || value);
					const cmd = String.fromCharCode(...bytes.slice(1, bytes.length - 1));
					state.commands.push(cmd);
				}
			}

			const commandChar = new FakeCharacteristic(charUuids.command, {
				isCommand: true,
			});
			const athenaEeg = new FakeCharacteristic(charUuids.athenaEeg, {
				emitOnSubscribe: true,
			});
			const athenaOther = new FakeCharacteristic(charUuids.athenaOther, {
				emitOnSubscribe: true,
			});
			const characteristics = [commandChar, athenaEeg, athenaOther];

			const service = {
				async getCharacteristics() {
					return characteristics;
				},
				async getCharacteristic(uuid) {
					const key = uuid.toLowerCase();
					const found = characteristics.find((ch) => ch.uuid === key);
					if (!found) {
						throw new Error("Unknown characteristic: " + uuid);
					}
					return found;
				},
			};

			const server = {
				async getPrimaryService(uuid) {
					if (uuid.toLowerCase() !== serviceUuid.toLowerCase()) {
						throw new Error("Unknown service: " + uuid);
					}
					return service;
				},
			};

			const device = {
				name: "Muse-Athena-Test",
				gatt: {
					connected: false,
					async connect() {
						this.connected = true;
						return server;
					},
				},
				addEventListener() {},
				removeEventListener() {},
			};

			Object.defineProperty(navigator, "bluetooth", {
				configurable: true,
				value: {
					async requestDevice(options) {
						state.requestDeviceCalls += 1;
						state.requestOptions = options;
						return device;
					},
				},
			});
		},
		{ serviceUuid: SERVICE_UUID, charUuids: CHAR_UUIDS },
	);

	await page.goto("/");

	await expect(page.locator("#status")).toContainText("WASM loaded");

	await page.selectOption("#device-source", "muse");
	await expect(page.locator("#status")).toContainText(
		"Mode: Muse / Athena / Synthetic Bridge",
	);

	await page.click("#connect");
	await expect(page.locator("#status")).toContainText(
		"Connected to Muse-Athena-Test",
	);
	await expect(page.locator("#start")).toBeEnabled();
	await expect(page.locator("#info")).toContainText('"protocol": "athena"');
	await expect(page.locator("#ppg-label")).toContainText("Optics");

	await page.click("#start");
	await expect(page.locator("#status")).toContainText(
		"Streaming Athena EEG + optics + IMU...",
	);

	await expect
		.poll(() => page.evaluate(() => window.__athenaTest.decoder.decodeCalls))
		.toBeGreaterThan(0);

	await expect
		.poll(() => page.evaluate(() => window.__athenaTest.commands.length))
		.toBe(8);

	const commands = await page.evaluate(() => window.__athenaTest.commands);
	expect(commands).toEqual([
		"v6",
		"s",
		"h",
		"p1041",
		"s",
		"dc001",
		"dc001",
		"s",
	]);

	const decoderState = await page.evaluate(() => window.__athenaTest.decoder);
	expect(decoderState.useDeviceTimestamps).toBe(true);
	expect(decoderState.clockKind).toBe("windowed");
	expect(decoderState.reorderWindowMs).toBe(0);
});
