import * as ppgWeb from "../index";

describe("@elata-biosciences/ppg-web exports", () => {
	test("exports the expected public functions", () => {
		expect(typeof ppgWeb.PpgProcessor).toBe("function");
		expect(typeof ppgWeb.PpgSession).toBe("function");
		expect(typeof ppgWeb.createPpgSession).toBe("function");
		expect(typeof ppgWeb.createMusePpgSession).toBe("function");
		expect(typeof ppgWeb.initPpgDemo).toBe("function");
	});
});
