import {
	createMusePpgSession,
	type CreateMusePpgSessionOptions,
} from "./ppgSession";

export async function initPpgDemo(
	options: CreateMusePpgSessionOptions = {},
) {
	const session = await createMusePpgSession({
		autoStart: true,
		windowSec: 16,
		source: "auto",
		channel: "auto",
		...options,
	});

	(window as Window & {
		__ppg_demo?: Record<string, unknown>;
	}).__ppg_demo = {
		session,
		transport: session.transport,
		processor: session.processor,
	};

	return { session, transport: session.transport, processor: session.processor };
}
