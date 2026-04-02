const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const DEMO_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".wasm": "application/wasm",
	".d.ts": "text/plain; charset=utf-8",
	".map": "application/json; charset=utf-8",
};

function resolvePath(urlPath) {
	const rawPath = urlPath.split("?")[0];
	const decoded = decodeURIComponent(rawPath);
	if (decoded === "/favicon.ico") {
		return { kind: "favicon" };
	}
	const requested = decoded === "/" ? "/index.html" : decoded;

	if (requested.startsWith("/packages/")) {
		const fullPath = path.resolve(REPO_ROOT, `.${requested}`);
		if (!fullPath.startsWith(REPO_ROOT)) {
			return null;
		}
		return { kind: "file", filePath: fullPath };
	}

	const fullPath = path.resolve(DEMO_ROOT, `.${requested}`);
	if (!fullPath.startsWith(DEMO_ROOT)) {
		return null;
	}
	return { kind: "file", filePath: fullPath };
}

const server = http.createServer((req, res) => {
	const resolved = resolvePath(req.url || "/");
	if (!resolved) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}
	if (resolved.kind === "favicon") {
		res.writeHead(204);
		res.end();
		return;
	}

	const { filePath } = resolved;

	fs.readFile(filePath, (err, content) => {
		if (err) {
			if (err.code === "ENOENT") {
				res.writeHead(404);
				res.end("Not Found");
			} else {
				res.writeHead(500);
				res.end("Internal Server Error");
			}
			return;
		}

		const ext = path.extname(filePath).toLowerCase();
		const contentType = MIME_TYPES[ext] || "application/octet-stream";
		res.writeHead(200, { "Content-Type": contentType });
		res.end(content);
	});
});

server.listen(PORT, "127.0.0.1", () => {
	// eslint-disable-next-line no-console
	console.log(`web-demo e2e server listening on http://127.0.0.1:${PORT}`);
});
