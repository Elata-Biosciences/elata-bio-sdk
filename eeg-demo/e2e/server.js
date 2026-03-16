const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = path.resolve(__dirname, "..");

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
	const requested = decoded === "/" ? "/index.html" : decoded;
	const fullPath = path.resolve(ROOT, `.${requested}`);
	if (!fullPath.startsWith(ROOT)) {
		return null;
	}
	return fullPath;
}

const server = http.createServer((req, res) => {
	const filePath = resolvePath(req.url || "/");
	if (!filePath) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

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
