// Asserts that every public API path carries a JSDoc comment, and that classic
// and mini document the same path with the same text.
//
// The check reads the built declarations (dist/*.d.ts) rather than src/*.ts on
// purpose: the declarations are what an editor shows on hover, so this asserts
// what consumers actually see, and it is the one place where each flavor's
// namespace constants are already collapsed into a single `zostr` tree — which
// makes the parity comparison a straight path-by-path diff.
//
// TypeScript 7 ships no JavaScript compiler API (`ts.createSourceFile` and
// friends are gone in the Go port), so the declarations are scanned directly.
// The scanner only needs to walk one object type literal, which keeps it small:
// it tracks strings and comments so braces inside a leaf's type can't be
// mistaken for a nested namespace.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FLAVORS = ["classic", "mini"];
const DECLARATION = "export declare const zostr: {";

/** Position of the first character after any whitespace/comment run. */
function skipTrivia(text, index) {
  let i = index;
  while (i < text.length) {
    const char = text[i];
    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      i += 1;
    } else if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end + 1;
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      break;
    }
  }
  return i;
}

/**
 * The JSDoc block immediately preceding `index`, normalized to its comment text
 * (leading asterisks and indentation removed) so two flavors can be compared
 * without depending on how the block happens to be wrapped. A non-JSDoc comment
 * or no comment at all yields null.
 */
function precedingJsDoc(text, index) {
  let i = index - 1;
  while (
    i >= 0 &&
    (text[i] === " " ||
      text[i] === "\t" ||
      text[i] === "\n" ||
      text[i] === "\r")
  ) {
    i -= 1;
  }
  if (i < 1 || text[i] !== "/" || text[i - 1] !== "*") return null;
  const start = text.lastIndexOf("/**", i);
  if (start === -1) return null;
  const body = text.slice(start + 3, i - 1);
  // `/*` (not `/**`) directly before the member: the block found above belongs
  // to something earlier, so the member itself is undocumented.
  if (body.includes("*/")) return null;
  return body
    .split("\n")
    .map((line) => line.replace(/^\s*\*?/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Index just past the leaf's type, i.e. after the `;` that closes the member. */
function skipLeafType(text, index) {
  let i = index;
  let depth = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipStringLiteral(text, i);
      continue;
    }
    if (text.startsWith("//", i) || text.startsWith("/*", i)) {
      i = skipTrivia(text, i);
      continue;
    }
    if (char === "{" || char === "(" || char === "[" || char === "<")
      depth += 1;
    else if (char === ">" && text[i - 1] === "=") {
      // The `>` of an arrow `=>` closes nothing.
    } else if (char === "}" || char === ")" || char === "]" || char === ">") {
      // A `}` at depth 0 closes the enclosing object: the last member ended
      // without a trailing `;`.
      if (depth === 0) return i;
      depth -= 1;
    } else if (char === ";" && depth === 0) {
      return i + 1;
    }
    i += 1;
  }
  return i;
}

/** Index just past the closing quote of the string literal starting at `index`. */
function skipStringLiteral(text, index) {
  const quote = text[index];
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/**
 * Walks one object type literal, recording every member's path and JSDoc text.
 * A member whose type opens with `{` is a namespace and is walked recursively;
 * anything else is a leaf. Returns the index just past the closing `}`.
 */
function parseMembers(text, index, prefix, members) {
  let i = index;
  for (;;) {
    i = skipTrivia(text, i);
    if (i >= text.length)
      throw new Error(`unterminated object literal at ${prefix || "zostr"}`);
    if (text[i] === "}") return i + 1;

    const nameStart = i;
    const nameMatch = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
    if (!nameMatch)
      throw new Error(
        `unexpected member syntax near: ${text.slice(i, i + 60)}`,
      );
    const name = nameMatch[0];
    const path = prefix ? `${prefix}.${name}` : name;
    i += name.length;

    i = skipTrivia(text, i);
    if (text[i] !== ":") throw new Error(`expected ':' after ${path}`);
    i = skipTrivia(text, i + 1);

    const isNamespace = text[i] === "{";
    members.set(path, {
      doc: precedingJsDoc(text, nameStart),
      kind: isNamespace ? "namespace" : "leaf",
    });

    if (isNamespace) {
      i = parseMembers(text, i + 1, path, members);
      i = skipTrivia(text, i);
      if (text[i] === ";") i += 1;
    } else {
      i = skipLeafType(text, i);
    }
  }
}

/** The full `zostr` surface of one flavor: Map<path, { doc, kind }>. */
function readSurface(flavor) {
  const text = readFileSync(join(root, "dist", `${flavor}.d.ts`), "utf8");
  const declaration = text.indexOf(DECLARATION);
  if (declaration === -1) {
    throw new Error(
      `dist/${flavor}.d.ts does not declare \`zostr\` — run \`npm run build\` first`,
    );
  }
  const members = new Map();
  members.set("zostr", {
    doc: precedingJsDoc(text, declaration),
    kind: "namespace",
  });
  parseMembers(text, declaration + DECLARATION.length, "", members);
  return members;
}

const surfaces = new Map(
  FLAVORS.map((flavor) => [flavor, readSurface(flavor)]),
);
const errors = [];

// 1. Every path is documented.
for (const [flavor, members] of surfaces) {
  for (const [path, { doc }] of members) {
    if (!doc) errors.push(`${flavor}: \`${path}\` has no JSDoc comment`);
  }
}

// 2. Both flavors expose the same paths, documented identically. Structural
//    parity is also asserted at runtime by src/api-surface.test.ts; repeating it
//    here keeps the diff below meaningful when only one flavor was edited.
const [reference, ...others] = FLAVORS;
const referenceMembers = surfaces.get(reference);
for (const flavor of others) {
  const members = surfaces.get(flavor);
  for (const path of referenceMembers.keys()) {
    if (!members.has(path))
      errors.push(
        `${flavor}: \`${path}\` is missing (present in ${reference})`,
      );
  }
  for (const path of members.keys()) {
    if (!referenceMembers.has(path))
      errors.push(
        `${reference}: \`${path}\` is missing (present in ${flavor})`,
      );
  }
  for (const [path, { doc }] of members) {
    const referenceDoc = referenceMembers.get(path)?.doc;
    if (!doc || !referenceDoc || doc === referenceDoc) continue;
    errors.push(
      `\`${path}\` is documented differently in ${reference} and ${flavor}:\n` +
        `    ${reference}: ${referenceDoc}\n` +
        `    ${flavor}: ${doc}`,
    );
  }
}

const total = referenceMembers.size;
if (errors.length > 0) {
  console.error(
    `Public JSDoc check failed (${errors.length} problem(s) across ${total} public paths):\n`,
  );
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    "\nEvery public path must carry a JSDoc comment, identical in classic and mini.",
  );
  process.exit(1);
}

console.log(
  `Public JSDoc check passed — ${total} public paths documented in ${FLAVORS.join(" and ")}.`,
);
