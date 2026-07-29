// Packs the package with `npm pack` and compiles the consumer fixture against
// the extracted tarball (placed in test/consumer/node_modules/zod-nostr), so the
// fixture resolves `zod-nostr` / `zod-nostr/mini` through the real
// package.json#exports and the tarball's `files` — the way an installed consumer
// does. This catches a dropped export, a missing declaration, or a wrong entry
// point, which a paths-mapped compile against dist/ cannot.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const consumerDir = dirname(fileURLToPath(import.meta.url));
const root = join(consumerDir, "..", "..");
const packDir = join(consumerDir, ".pack");
const nodeModules = join(consumerDir, "node_modules");
const pkgDir = join(nodeModules, "zod-nostr");

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });

// Fresh state so a stale package can't mask a regression.
rmSync(packDir, { recursive: true, force: true });
rmSync(nodeModules, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });
mkdirSync(pkgDir, { recursive: true });

// Build, then pack exactly what would be published.
run("npm", ["run", "build"]);
run("npm", ["pack", "--silent", "--pack-destination", packDir]);

const tarball = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
if (!tarball) throw new Error("npm pack produced no tarball");

// Extract package/ -> node_modules/zod-nostr (peer `zod` resolves from the repo
// root node_modules by walking up).
run("tar", [
  "-xzf",
  join(packDir, tarball),
  "-C",
  pkgDir,
  "--strip-components=1",
]);

// Compile the fixture against the installed tarball (no paths mapping).
run("npx", ["tsc", "-p", join(consumerDir, "tsconfig.json")]);

console.log("consumer gate: OK (compiled against packed", tarball, ")");
