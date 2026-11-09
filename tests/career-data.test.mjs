import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = join(root, "scripts", "career-data.sh");

function tempDir(prefix = "career-data-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function generate(mirror, env = {}) {
  return spawnSync(generator, [mirror], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function generateOrFail(mirror, env = {}) {
  const result = generate(mirror, env);
  assert.equal(result.status, 0, result.stderr || result.stdout || "generator exited without output");
  return result;
}

function frontmatter(file, key) {
  const text = readFileSync(file, "utf8");
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const line = block.split("\n").find((entry) => entry.startsWith(`${key}:`));
  return line?.replace(new RegExp(`^${key}:\\s*`), "").replace(/^["']|["']$/g, "") ?? "";
}

function markdownHeading(file) {
  return readFileSync(file, "utf8").match(/^#\s+(.+)$/m)?.[1] ?? "";
}

function projectFiles() {
  return readdirSync(join(root, "content", "projects"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(root, "content", "projects", name));
}

function section(cv, title) {
  const start = cv.indexOf(`## ${title}`);
  assert.notEqual(start, -1, `${title} is a section`);
  const rest = cv.slice(start + title.length + 3);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

let mirror;
let cv;
let profile;

before(() => {
  mirror = tempDir();
  generateOrFail(mirror);
  cv = readFileSync(join(mirror, "cv.md"), "utf8");
  profile = readFileSync(join(mirror, "config", "profile.yml"), "utf8");
});

test("the CV carries the identity block and the live portfolio URL", () => {
  assert.match(cv, /^# CV -- Jenny Mae Leidig\n\nSoftware Engineer & Digital Experience Creator\n/);
  assert.match(cv, /^\*\*Location:\*\* Richmond, VA$/m);
  assert.match(cv, /^\*\*Email:\*\* jennymaeleidig@gmail\.com$/m);
  assert.match(cv, /^\*\*Phone:\*\* \(276\) 356-4765$/m);
  assert.match(cv, /^\*\*Portfolio:\*\* https:\/\/portfolio\.jenny-page\.online$/m);
  assert.match(cv, /^\*\*itch\.io:\*\* https:\/\/jennyleidig\.itch\.io\/$/m);
  assert.match(cv, /^\*\*LinkedIn:\*\* https:\/\/www\.linkedin\.com\/in\/jleidig\/$/m);
  assert.match(cv, /^\*\*GitHub:\*\* https:\/\/github\.com\/jennymaeleidig$/m);
  assert.doesNotMatch(cv, /straw\.page/);
});

test("the profile candidate block carries the same identity and the live portfolio URL", () => {
  assert.match(profile, /^candidate:$/m);
  assert.match(profile, /^  full_name: "Jenny Mae Leidig"$/m);
  assert.match(profile, /^  title: "Software Engineer & Digital Experience Creator"$/m);
  assert.match(profile, /^  email: "jennymaeleidig@gmail\.com"$/m);
  assert.match(profile, /^  phone: "\(276\) 356-4765"$/m);
  assert.match(profile, /^  location: "Richmond, VA"$/m);
  assert.match(profile, /^  portfolio_url: "https:\/\/portfolio\.jenny-page\.online"$/m);
  assert.match(profile, /^  linkedin: "linkedin\.com\/in\/jleidig"$/m);
  assert.match(profile, /^  github: "github\.com\/jennymaeleidig"$/m);
  assert.match(profile, /^  photo: ""$/m);
  assert.doesNotMatch(profile, /straw\.page/);
});

test("the CV carries every career role, grouped under its employer", () => {
  const experience = section(cv, "Work Experience");
  for (const file of readdirSync(join(root, "content", "career", "experience")).filter((n) => n.endsWith(".md"))) {
    const path = join(root, "content", "career", "experience", file);
    assert.ok(experience.includes(`### ${frontmatter(path, "employer")} -- ${frontmatter(path, "location")}`));
    assert.ok(experience.includes(`**${frontmatter(path, "title")}**`));
  }
  assert.ok(experience.indexOf("### Chadwick & Son Orchids") < experience.indexOf("### CapTech Consulting"));
  assert.ok(experience.indexOf("### CapTech Consulting") < experience.indexOf("### Virginia Tech College of Engineering"));
  assert.ok(
    experience.indexOf("**Software Engineer - Consultant**") <
      experience.indexOf("**Software Engineer - Associate Consultant**"),
    "roles are newest first",
  );
});

test("the CV carries every publication, volunteering entry, education entry and CV project", () => {
  const publications = section(cv, "Publications");
  for (const file of readdirSync(join(root, "content", "career", "publications")).filter((n) => n.endsWith(".md"))) {
    const path = join(root, "content", "career", "publications", file);
    assert.ok(publications.includes(frontmatter(path, "title")), `${file} title`);
    assert.ok(publications.includes(frontmatter(path, "venue")), `${file} venue`);
  }

  const volunteering = section(cv, "Volunteering");
  for (const file of readdirSync(join(root, "content", "career", "volunteering")).filter((n) => n.endsWith(".md"))) {
    const path = join(root, "content", "career", "volunteering", file);
    assert.ok(volunteering.includes(frontmatter(path, "organization")), `${file} organisation`);
    assert.ok(volunteering.includes(frontmatter(path, "title")), `${file} title`);
  }

  const education = section(cv, "Education");
  for (const file of readdirSync(join(root, "content", "career", "education")).filter((n) => n.endsWith(".md"))) {
    const path = join(root, "content", "career", "education", file);
    assert.ok(education.includes(frontmatter(path, "institution")), `${file} institution`);
    assert.ok(education.includes(frontmatter(path, "degree")), `${file} degree`);
  }

  const projects = section(cv, "Projects");
  for (const file of projectFiles()) {
    if (frontmatter(file, "cv") !== "true") continue;
    assert.ok(projects.includes(`### ${markdownHeading(file)} -- ${frontmatter(file, "year")}`), `${file} heading`);
    assert.ok(projects.includes(frontmatter(file, "cv_blurb")), `${file} blurb`);
  }

  assert.ok(section(cv, "Professional Summary").includes("Software engineer with two years"));
  assert.ok(section(cv, "Skills").includes("**Data and cloud:**"));
});

test("the CV does not invent projects that are not in content/", () => {
  const projects = section(cv, "Projects");
  for (const absent of [
    "x86 Soundscape",
    "56 kbit/s",
    "Pico Dragoon Mini",
    "Yolked",
    "the lazy sundays blog",
    "Streaming Like It's 1998",
    "MiSTer FPGA",
  ]) {
    assert.doesNotMatch(projects, new RegExp(absent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("running the generator twice is byte-identical", () => {
  const firstCv = readFileSync(join(mirror, "cv.md"), "utf8");
  const firstProfile = readFileSync(join(mirror, "config", "profile.yml"), "utf8");
  generateOrFail(mirror);
  assert.equal(readFileSync(join(mirror, "cv.md"), "utf8"), firstCv);
  assert.equal(readFileSync(join(mirror, "config", "profile.yml"), "utf8"), firstProfile);

  const other = tempDir();
  generateOrFail(other);
  assert.equal(readFileSync(join(other, "cv.md"), "utf8"), firstCv);
  assert.equal(readFileSync(join(other, "config", "profile.yml"), "utf8"), firstProfile);
});

test("merging into an existing profile keeps the editorial keys", () => {
  const existing = tempDir();
  const config = join(existing, "config");
  mkdirSync(config, { recursive: true });
  const before = [
    "# Career-Ops Profile Configuration",
    "",
    "candidate:",
    '  full_name: "Old Name"',
    '  email: "old@example.com"',
    '  location: "Old Town"',
    '  portfolio_url: "https://jennyleidig.straw.page"',
    "",
    "target_roles:",
    "  primary:",
    '    - "Software Engineer"',
    '    - "Creative Technologist"',
    "",
    "narrative:",
    '  headline: "Software engineer moving toward creative computing"',
    "",
    "compensation:",
    '  target_range: "$100,000 base"',
    "",
  ].join("\n");
  writeFileSync(join(config, "profile.yml"), before);

  generateOrFail(existing);
  const merged = readFileSync(join(config, "profile.yml"), "utf8");

  assert.match(merged, /^  full_name: "Jenny Mae Leidig"$/m);
  assert.match(merged, /^  portfolio_url: "https:\/\/portfolio\.jenny-page\.online"$/m);
  assert.doesNotMatch(merged, /Old Name|old@example\.com|straw\.page/);
  assert.ok(merged.includes('target_roles:\n  primary:\n    - "Software Engineer"\n    - "Creative Technologist"'));
  assert.ok(merged.includes('narrative:\n  headline: "Software engineer moving toward creative computing"'));
  assert.ok(merged.includes('compensation:\n  target_range: "$100,000 base"'));

  generateOrFail(existing);
  assert.equal(readFileSync(join(config, "profile.yml"), "utf8"), merged);
});

test("a cv:true project without a blurb fails the generation", () => {
  const content = tempDir("career-content-");
  writeFileSync(
    join(content, "no-blurb.md"),
    "---\nyear: 2026\nstatus: active\ncategory: web\ncv: true\n---\n# No Blurb\n\nA project with no CV blurb.\n",
  );
  const result = generate(tempDir(), { CONTENT_DIR: content });
  assert.notEqual(result.status, 0, "the generation fails");
  assert.match(result.stderr, /no-blurb\.md: cv: true requires cv_blurb/);
});

test("the phone number is in the mirror", () => {
  assert.match(cv, /\(276\) 356-4765/);
  assert.match(profile, /\(276\) 356-4765/);
});
