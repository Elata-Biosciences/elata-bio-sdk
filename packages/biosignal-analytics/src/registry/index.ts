/** Metric registry: seed definitions, lookup helpers, zod schemas. */

import { REGISTRY_V1 } from "./definitions.js";
import type {
	EvidenceTier,
	MetricDefinitionV1,
	MetricDomain,
} from "./types.js";

export * from "./types.js";
export * from "./schema.js";
export {
	ALGORITHM_IDS,
	ALGORITHM_VERSIONS,
	getAlgorithm,
	isKnownAlgorithmId,
} from "./algorithms.js";
export type { AlgorithmName, AlgorithmVersionEntry } from "./algorithms.js";
export { REGISTRY_V1 } from "./definitions.js";

const byId: ReadonlyMap<string, MetricDefinitionV1> = new Map(
	REGISTRY_V1.map((definition) => [definition.id, definition]),
);

export interface ListMetricsFilter {
	domain?: MetricDomain;
	tier?: EvidenceTier;
	/** true -> only implemented (not registered-only); false -> only registered-only. */
	implemented?: boolean;
}

export function getMetricDefinition(
	id: string,
): MetricDefinitionV1 | undefined {
	return byId.get(id);
}

export function listMetrics(
	filter: ListMetricsFilter = {},
): readonly MetricDefinitionV1[] {
	return REGISTRY_V1.filter((definition) => {
		if (filter.domain !== undefined && definition.domain !== filter.domain)
			return false;
		if (filter.tier !== undefined && definition.evidenceTier !== filter.tier)
			return false;
		if (filter.implemented !== undefined) {
			const implemented = definition.implementedIn !== "registered-only";
			if (implemented !== filter.implemented) return false;
		}
		return true;
	});
}
