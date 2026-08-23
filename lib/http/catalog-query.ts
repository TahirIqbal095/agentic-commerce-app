import type { JsonObject } from "@/db/schema/types";
import type { CatalogSearch } from "@/modules/catalog/catalog";
import { isUnsignedInteger, isUuid } from "@/lib/validation";

export type QueryValidationResult =
  | { ok: true; value: CatalogSearch }
  | {
      ok: false;
      error: {
        code: "INVALID_QUERY";
        message: string;
        details: { field?: string };
      };
    };

const ALLOWED_PARAMETERS = new Set([
  "query",
  "category",
  "minPriceMinor",
  "maxPriceMinor",
  "attributes",
  "cursor",
  "limit",
]);

function invalid(field: string, message: string): QueryValidationResult {
  return {
    ok: false,
    error: { code: "INVALID_QUERY", message, details: { field } },
  };
}

function parseNonnegativeInteger(
  params: URLSearchParams,
  field: "minPriceMinor" | "maxPriceMinor",
): number | QueryValidationResult | undefined {
  const raw = params.get(field);
  if (raw === null) return undefined;

  if (!isUnsignedInteger(raw)) {
    return invalid(field, `${field} must be a non-negative integer.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return invalid(field, `${field} must be a safe integer.`);
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseProductSearchQuery(
  params: URLSearchParams,
): QueryValidationResult {
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      return invalid(key, `Unknown query parameter: ${key}.`);
    }
    if (params.getAll(key).length > 1) {
      return invalid(key, `${key} may only be provided once.`);
    }
  }

  const query = params.get("query");
  if (query !== null && query.trim().length === 0) {
    return invalid("query", "query cannot be empty.");
  }

  const category = params.get("category");
  if (category !== null && category.trim().length === 0) {
    return invalid("category", "category cannot be empty.");
  }

  const minPriceMinor = parseNonnegativeInteger(params, "minPriceMinor");
  if (typeof minPriceMinor === "object") return minPriceMinor;
  const maxPriceMinor = parseNonnegativeInteger(params, "maxPriceMinor");
  if (typeof maxPriceMinor === "object") return maxPriceMinor;
  if (
    minPriceMinor !== undefined &&
    maxPriceMinor !== undefined &&
    minPriceMinor > maxPriceMinor
  ) {
    return invalid(
      "minPriceMinor",
      "minPriceMinor cannot be greater than maxPriceMinor.",
    );
  }

  let attributes: JsonObject | undefined;
  const rawAttributes = params.get("attributes");
  if (rawAttributes !== null) {
    try {
      const parsed: unknown = JSON.parse(rawAttributes);
      if (!isJsonObject(parsed)) {
        return invalid("attributes", "attributes must be a JSON object.");
      }
      attributes = parsed;
    } catch {
      return invalid("attributes", "attributes must be valid JSON.");
    }
  }

  const rawLimit = params.get("limit");
  let limit = 20;
  if (rawLimit !== null) {
    if (!isUnsignedInteger(rawLimit)) {
      return invalid("limit", "limit must be an integer between 1 and 50.");
    }
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      return invalid("limit", "limit must be an integer between 1 and 50.");
    }
  }

  const cursor = params.get("cursor");
  if (cursor !== null && !isUuid(cursor)) {
    return invalid("cursor", "cursor is invalid.");
  }

  return {
    ok: true,
    value: {
      ...(query !== null ? { query: query.trim() } : {}),
      ...(category !== null ? { category: category.trim() } : {}),
      ...(minPriceMinor !== undefined ? { minPriceMinor } : {}),
      ...(maxPriceMinor !== undefined ? { maxPriceMinor } : {}),
      ...(attributes !== undefined ? { attributes } : {}),
      ...(cursor !== null ? { cursor } : {}),
      limit,
    },
  };
}
