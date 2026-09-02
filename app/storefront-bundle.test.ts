import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

/**
 * The Storefront's client entry. Everything it can reach at runtime is compiled
 * into the browser bundle.
 */
const CLIENT_ENTRY = "app/shopping-assistant.tsx";

/**
 * Modules that only run on a server. A browser has no socket, no DNS resolver,
 * and no business holding the Brand's database credentials, so reaching one of
 * these from the client entry fails the Storefront's build rather than any
 * test — which is why this guard is static.
 */
const SERVER_ONLY_PACKAGES = ["pg", "drizzle-orm", "drizzle-orm/node-postgres"];

/**
 * Reads one module's runtime imports.
 *
 * A type-only import is erased before the bundler sees it, so it is not a
 * runtime edge: `import type { CartView } from "./cart"` may name a database
 * module safely, while importing one value from it pulls the whole module in.
 *
 * @param source - The module's TypeScript source.
 * @returns Every specifier the module imports at runtime.
 */
function runtimeImportsOf(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern =
    /import\s+(type\s+)?([\s\S]*?)\s+from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(importPattern)) {
    const [, typeOnly, clause, specifier, sideEffectSpecifier] = match;
    if (sideEffectSpecifier) {
      specifiers.push(sideEffectSpecifier);
      continue;
    }
    if (typeOnly) continue;
    const named = clause.match(/\{([\s\S]*)\}/);
    const bindings = named?.[1]
      .split(",")
      .map((binding) => binding.trim())
      .filter(Boolean);
    const isDefaultOrNamespaceImport =
      clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, "").trim().length > 0;
    if (
      !isDefaultOrNamespaceImport &&
      bindings &&
      bindings.every((binding) => binding.startsWith("type "))
    ) {
      continue;
    }
    specifiers.push(specifier);
  }
  return specifiers;
}

/**
 * Resolves one import specifier to a file in this repository.
 *
 * @param specifier - The imported specifier.
 * @param fromFile - Repo-relative path of the importing module.
 * @returns The repo-relative path of the imported module, or `null` for a
 *   package, which is judged by name rather than followed.
 */
function resolveModule(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(repoRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(repoRoot, path.dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ]) {
    try {
      readFileSync(candidate);
      return path.relative(repoRoot, candidate);
    } catch {
      continue;
    }
  }
  return null;
}

test("the Storefront's client entry reaches no server-only module", () => {
  const visited = new Set<string>();
  const offences: string[] = [];
  const queue = [CLIENT_ENTRY];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(path.join(repoRoot, file), "utf8");
    for (const specifier of runtimeImportsOf(source)) {
      if (SERVER_ONLY_PACKAGES.includes(specifier)) {
        offences.push(`${file} imports ${specifier}`);
        continue;
      }
      const imported = resolveModule(specifier, file);
      if (imported === null) continue;
      if (imported.startsWith("db/")) {
        offences.push(`${file} imports ${imported}`);
        continue;
      }
      queue.push(imported);
    }
  }

  assert.deepEqual(offences, []);
  assert.ok(visited.has("modules/cart/checkout-readiness.ts"));
});
