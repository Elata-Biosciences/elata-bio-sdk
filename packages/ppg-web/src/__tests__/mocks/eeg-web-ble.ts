import type { HeadbandTransport } from "./eeg-web";

// Loose stand-in for the real factory type; tests pass trivial decoder doubles.
export type AthenaDecoderFactory = () => unknown;

export interface MuseDeviceOptions {
	athenaDecoderFactory?: AthenaDecoderFactory;
}

export class BleTransport implements HeadbandTransport {
	public onFrame?: HeadbandTransport["onFrame"];
	public onStatus?: HeadbandTransport["onStatus"];

	constructor(_options: {
		deviceOptions?: MuseDeviceOptions;
		sourceName?: string;
	} = {}) {}

	async connect(): Promise<void> {}
	async disconnect(): Promise<void> {}
	async start(): Promise<void> {}
	async stop(): Promise<void> {}
}
