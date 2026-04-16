import type { HeadbandTransport } from "./eeg-web";

export interface MuseDeviceOptions {
	athenaDecoderFactory?: () => unknown;
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
