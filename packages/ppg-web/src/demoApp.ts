import {
	createMusePpgSession,
	type CreateMusePpgSessionOptions,
} from "./ppgSession";

type DemoWindow = Window & {
	__ppgAthenaDecoderFactory?: () => unknown;
	__ppgAthenaInitError?: string;
};

export async function initPpgDemo(
	options: CreateMusePpgSessionOptions = {},
) {
	const demoWindow = window as DemoWindow;
	const athenaDecoderFactory =
		options.deviceOptions?.athenaDecoderFactory ??
		demoWindow.__ppgAthenaDecoderFactory;
	const sessionOptions: CreateMusePpgSessionOptions = {
		...options,
		deviceOptions: {
			...(options.deviceOptions ?? {}),
			...(athenaDecoderFactory ? { athenaDecoderFactory } : {}),
		},
	};

	const session = await createMusePpgSession({
		autoStart: true,
		windowSec: 16,
		source: "auto",
		channel: "auto",
		...sessionOptions,
	});

	(window as Window & {
		__ppg_demo?: Record<string, unknown>;
		__ppgAthenaInitError?: string;
	}).__ppg_demo = {
		session,
		transport: session.transport,
		processor: session.processor,
		athenaInitError: demoWindow.__ppgAthenaInitError,
	};

	return { session, transport: session.transport, processor: session.processor };
}
