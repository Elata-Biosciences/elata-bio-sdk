/**
 * Identifier generation and validation.
 *
 * The host assigns canonical ids (session, stream, source, event); clients
 * propose descriptors but never identities. Generation is DI-injectable for
 * deterministic tests.
 */

export type IdGenerator = () => string;

export function defaultIdGenerator(): string {
	return crypto.randomUUID();
}

/** Event and app-facing names: lowercase, dot/dash/underscore, ≤64 chars. */
export const NAME_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

export function isValidName(value: unknown): value is string {
	return typeof value === "string" && NAME_PATTERN.test(value);
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_PATTERN.test(value);
}
