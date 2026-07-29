// Packs the package with `npm pack` and compiles the consumer fixture against
// the extracted tarball, resolving `zod-nostr` / `zod-nostr/mini` through the
// real package.json#exports and the tarball's `files` — the way an installed
// consumer does. This catches a dropped export, a missing declaration, or a
// wrong entry point, which a paths-mapped compile against dist/ cannot.
//
// The compile MUST run outside the zod-nostr package tree: the fixture lives
// inside the package root, so from there TypeScript resolves `zod-nostr` via
// package self-reference to the repo's own dist/, ignoring the tarball. So we
// copy the fixture into an OS temp dir whose node_modules holds the extracted
// tarball, run tsc there, and assert via --traceResolution that resolution
// actually went through node_modules/zod-nostr (not the repo dist).
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const consumerDir = dirname(fileURLToPath(import.meta.url));
const root = join(consumerDir, "..", "..");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (status ${res.status})`);
  }
}

// Build and pack exactly what would be published.
run("npm", ["run", "build"], { cwd: root });
const packDir = mkdtempSync(join(tmpdir(), "zod-nostr-pack-"));
run("npm", ["pack", "--silent", "--pack-destination", packDir], { cwd: root });
const tarball = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
if (!tarball) throw new Error("npm pack produced no tarball");

// Assemble an isolated workspace outside the package scope.
const workDir = mkdtempSync(join(tmpdir(), "zod-nostr-consumer-"));
const nodeModules = join(workDir, "node_modules");
const pkgDir = join(nodeModules, "zod-nostr");
mkdirSync(pkgDir, { recursive: true });
run("tar", [
  "-xzf",
  join(packDir, tarball),
  "-C",
  pkgDir,
  "--strip-components=1",
]);
// Peer dependency: point `zod` (and its subpaths) at the repo's installed copy.
symlinkSync(join(root, "node_modules", "zod"), join(nodeModules, "zod"), "dir");
cpSync(join(consumerDir, "consumer.ts"), join(workDir, "consumer.ts"));
cpSync(join(consumerDir, "tsconfig.json"), join(workDir, "tsconfig.json"));
writeFileSync(
  join(workDir, "package.json"),
  `${JSON.stringify({ name: "zod-nostr-consumer-fixture", private: true, type: "module" }, null, 2)}\n`,
);

// Compile with resolution tracing so we can both fail on type errors and prove
// where `zod-nostr` resolved from. Invoke the repo's own tsc by absolute path —
// from the temp dir `npx tsc` would resolve to the unrelated `tsc` npm shim.
const tscBin = join(root, "node_modules", ".bin", "tsc");
const res = spawnSync(tscBin, ["-p", "tsconfig.json", "--traceResolution"], {
  cwd: workDir,
  encoding: "utf8",
});
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;

if (res.status !== 0) {
  console.error(output);
  throw new Error(
    "consumer fixture failed to compile against the packed tarball",
  );
}

// Every `zod-nostr` resolution must land inside the extracted tarball, never the
// repo's own dist/ (which would mean package self-reference silently bypassed
// the tarball, defeating the gate).
const resolvedPaths = [
  ...output.matchAll(
    /Module name '(zod-nostr(?:\/[^']*)?)' was successfully resolved to '([^']+)'/g,
  ),
].map(([, name, path]) => ({ name, path }));

// Compare against real paths: the traced paths are canonicalized (e.g. macOS
// resolves /var -> /private/var), so the temp dir must be too.
const expectedPrefix = realpathSync(pkgDir) + sep;
const repoDist = join(realpathSync(root), "dist") + sep;
const wrong = resolvedPaths.filter(
  (r) => !r.path.startsWith(expectedPrefix) || r.path.startsWith(repoDist),
);
if (resolvedPaths.length === 0) {
  throw new Error(
    "no `zod-nostr` module resolution was traced — cannot verify the tarball was used",
  );
}
if (wrong.length > 0) {
  console.error("zod-nostr resolved outside the packed tarball:");
  for (const r of wrong) console.error(`  ${r.name} -> ${r.path}`);
  throw new Error("consumer gate did not resolve through the packed tarball");
}

rmSync(packDir, { recursive: true, force: true });
rmSync(workDir, { recursive: true, force: true });
console.log(
  `consumer gate: OK (compiled against packed ${tarball}; ${resolvedPaths.length} zod-nostr resolutions verified through node_modules/zod-nostr)`,
);
