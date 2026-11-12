import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { POSTER, posterHash } from "../../scripts/sky-poster.mjs";

export const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const buildScript = join(root, "scripts", "build.sh");

export const SKY_TOKENS = ["sky-1", "sky-2", "sky-3", "sky-4"];
export const TOKENS = [
  "paper",
  "ink",
  "accent",
  "accent-bright",
  ...SKY_TOKENS,
];

// The build reads one site, and the tests read a fixture site rather than the
// real content: what a test asserts never depends on what Jenny has written
// this week. Each test that cares writes its own projects into a temp
// directory and passes them as CONTENT_DIR.
export const fixtureSite = join(root, "tests", "fixtures", "site");
export const FIXTURE_ENV = {
  CONTENT_DIR: join(fixtureSite, "projects"),
  CAREER_DIR: join(fixtureSite, "career"),
  IDENTITY_FILE: join(fixtureSite, "identity.sh"),
  ABOUT_FILE: join(fixtureSite, "about.md"),
  NOW_FILE: join(fixtureSite, "now.md"),
};

export function build(dist, env = {}) {
  return execFileSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, ...FIXTURE_ENV, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

export function buildFixture(content, dist) {
  return spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, ...FIXTURE_ENV, CONTENT_DIR: content },
    encoding: "utf8",
  });
}

export function writeProject(content, slug, frontmatter, body) {
  writeFileSync(
    join(content, `${slug}.md`),
    `---\n${frontmatter.trim()}\n---\n${body ?? `# ${slug}\n\nProse for ${slug}.\n`}`,
  );
}

export function catalogueRows(html) {
  const table =
    html.match(/<table class="catalogue"[\s\S]*?<\/table>/)?.[0] ?? "";
  return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => row.match(/<a href="([^"]+)"/)?.[1])
    .filter(Boolean);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tabBar(html) {
  return (
    html.match(
      /<nav class="tab-bar" aria-label="Work sections">([\s\S]*?)<\/nav>/,
    )?.[1] ?? ""
  );
}

export function currentTabs(html) {
  return [
    ...tabBar(html).matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g),
  ].map(([, href]) => href);
}

export function currentNavLinks(html) {
  const nav =
    html.match(/<nav aria-label="Primary">([\s\S]*?)<\/nav>/)?.[1] ?? "";
  return [...nav.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(
    ([, href]) => href,
  );
}

export const CAREER_SECTIONS = [
  "experience",
  "volunteering",
  "education",
  "skills",
];

export function filters(html) {
  return (
    html.match(
      /<nav aria-label="(?:Categories|Career sections)">([\s\S]*?)<\/nav>/,
    )?.[1] ?? ""
  );
}

export function filterLabels(html) {
  return [...filters(html).matchAll(/<a href="[^"]+"[^>]*>([^<]+)<\/a>/g)].map(
    ([, label]) => label,
  );
}

export function currentFilters(html) {
  return [
    ...filters(html).matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g),
  ].map(([, href]) => href);
}

export function careerHeadings(html) {
  return [...html.matchAll(/<h2 id="career-[^"]+">([^<]+)<\/h2>/g)].map(
    ([, text]) => text,
  );
}

export function careerSection(html, name) {
  const start = html.indexOf(`<h2 id="career-${name}">`);
  if (start < 0) return "";
  const next = html.indexOf('<h2 id="career-', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}

export function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) =>
    parseInt(hex.slice(index, index + 2), 16),
  );
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// The fixture site's identity owns the host the build writes into the sitemap,
// so the expectation is read from the same file the build reads.
export const SITE_HOST = readFileSync(join(fixtureSite, "identity.sh"), "utf8")
  .match(/^PORTFOLIO=(.*)$/m)[1]
  .trim();

// The name composed into every page title, for the tests that check the suffix
// does not reach a preview card.
export const SITE_NAME = readFileSync(join(fixtureSite, "identity.sh"), "utf8")
  .match(/^SITE_NAME="?([^"\n]*)"?$/m)[1]
  .trim();

// The route set as a visitor could enumerate it: every index.html under the
// dist tree, with the Pages 404 fallback and the /404 route itself excluded.
// This walks the emitted filesystem rather than reading the sitemap, so a page
// with no sitemap entry and a sitemap entry with no page both fail below.
export function emittedRoutes(base) {
  const routes = [];
  for (const file of walk(base)) {
    if (!file.endsWith(".html")) {
      continue;
    }
    const rel = relative(base, file);
    if (rel === "404.html") {
      continue;
    }
    if (rel === "index.html") {
      routes.push("/");
    } else if (rel.endsWith("/index.html")) {
      const route = `/${rel.slice(0, -"index.html".length)}`;
      if (route !== "/404/") {
        routes.push(route);
      }
    }
  }
  return routes.sort();
}

export function sitemapLocs(base) {
  const xml = readFileSync(join(base, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
}

export function articleSlugs() {
  const projects = FIXTURE_ENV.CONTENT_DIR;
  return readdirSync(projects)
    .filter((name) => name.endsWith(".md"))
    .filter((name) =>
      /^category:\s*articles\s*$/m.test(
        readFileSync(join(projects, name), "utf8"),
      ),
    )
    .map((name) => name.replace(/\.md$/, ""));
}

// The fixture site, built once for the whole run. Every test file reads the
// same pages, so the build is keyed by a fingerprint of what it was built
// from: a stale tree is never reused, and the first file to need it builds it
// while the others wait for the marker file rather than building again.
const FINGERPRINT_SOURCES = [
  "scripts",
  "layouts",
  "assets",
  "vendor",
  "tests/fixtures/site",
];

function fingerprint() {
  const hash = createHash("sha256");
  for (const source of FINGERPRINT_SOURCES) {
    for (const file of walk(join(root, source)).sort()) {
      const stats = statSync(file);
      hash.update(`${relative(root, file)}:${stats.size}:${stats.mtimeMs}
`);
    }
  }
  return hash.digest("hex").slice(0, 16);
}

let shared;

export async function sharedSite() {
  if (shared) {
    return shared;
  }
  const dir = join(tmpdir(), `portfolio-build-${fingerprint()}`);
  const marker = join(dir, "index.html");
  if (!existsSync(marker)) {
    const staging = mkdtempSync(join(tmpdir(), "portfolio-build-staging-"));
    build(staging);
    try {
      renameSync(staging, dir);
    } catch (error) {
      // Another file finished first: its tree is the same tree.
      rmSync(staging, { recursive: true, force: true });
    }
    const deadline = Date.now() + 120_000;
    while (!existsSync(marker)) {
      if (Date.now() > deadline) {
        throw new Error(`the shared build never appeared at ${dir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  shared = {
    output: dir,
    htmlFiles: walk(dir).filter((path) => path.endsWith(".html")),
    siteCss: readFileSync(join(dir, "assets", "site.css"), "utf8"),
  };
  return shared;
}

export { POSTER, posterHash };
