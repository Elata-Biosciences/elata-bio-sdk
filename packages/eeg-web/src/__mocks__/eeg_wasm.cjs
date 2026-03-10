module.exports = {
	default: function initWasm(moduleOrPath) {
		return Promise.resolve({ initializedWith: moduleOrPath });
	},
	initSync: function initSync(module) {
		return { syncInit: true, module };
	},
	exportedValue: 123,
	doSomething: function doSomething() {
		return "ok";
	},
};
