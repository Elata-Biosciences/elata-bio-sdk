const createMusePpgSession = jest.fn(async () => ({
	transport: { kind: "transport" },
	processor: { kind: "processor" },
}));

jest.mock("../ppgSession", () => ({
	createMusePpgSession,
}));

import { initPpgDemo } from "../demoApp";

describe("initPpgDemo", () => {
	beforeEach(() => {
		createMusePpgSession.mockClear();
		delete (window as Window & { __ppgAthenaDecoderFactory?: () => unknown })
			.__ppgAthenaDecoderFactory;
	});

	test("forwards the global Athena decoder factory into deviceOptions", async () => {
		const athenaDecoderFactory = () => ({ kind: "athena-decoder" });
		(
			window as Window & { __ppgAthenaDecoderFactory?: () => unknown }
		).__ppgAthenaDecoderFactory = athenaDecoderFactory;

		await initPpgDemo();

		expect(createMusePpgSession).toHaveBeenCalledWith(
			expect.objectContaining({
				deviceOptions: expect.objectContaining({
					athenaDecoderFactory,
				}),
			}),
		);
	});

	test("preserves an explicitly provided Athena decoder factory", async () => {
		const demoFactory = () => ({ kind: "demo-factory" });
		const explicitFactory = () => ({ kind: "explicit-factory" });
		(
			window as Window & { __ppgAthenaDecoderFactory?: () => unknown }
		).__ppgAthenaDecoderFactory = demoFactory;

		await initPpgDemo({
			deviceOptions: {
				athenaDecoderFactory: explicitFactory,
			},
		});

		expect(createMusePpgSession).toHaveBeenCalledWith(
			expect.objectContaining({
				deviceOptions: expect.objectContaining({
					athenaDecoderFactory: explicitFactory,
				}),
			}),
		);
	});
});
