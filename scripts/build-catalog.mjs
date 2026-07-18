#!/usr/bin/env node
// Builds catalog/skills.catalog.json from every skills/<slug>/SKILL.md.
// Each SKILL.md (Anthropic Agent-Skill format: YAML frontmatter + body) becomes
// a marketplace Skill: an injectable system-prompt fragment with a deterministic
// X402 price and rating. Deterministic on purpose — no Date/random — so the
// catalog is reproducible and diff-friendly in CI.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(ROOT, "skills");
const OUT = join(ROOT, "catalog", "skills.catalog.json");

/** Keyword → SkillCategory. First hit wins; falls back to "coding". */
const CATEGORY_RULES = [
  [/finance|trading|arbitrage|payment|invoice/i, "finance"],
  [/audio|voice|speech|\btts\b/i, "audio"],
  [/\bvision\b|screenshot|image gen|devtools|visual regression|browser-testing/i, "vision"],
  [/research|fact.?check|\breport|documentation|\badr\b|interview|context.eng|ресёрч|факт|отчёт|инъекц|injection|secret|leak/i, "nlp"],
  [/\bplan|decompos|priorit|task.break|breakdown|idea|refine|quality.gate|estimate|скор|декомпоз|приоритет|качеств/i, "logic"],
];
function categorize(name, desc) {
  const hay = `${name} ${desc}`;
  for (const [re, cat] of CATEGORY_RULES) if (re.test(hay)) return cat;
  return "coding";
}

/** Deterministic hash → stable pseudo-values without Math.random. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Price scales with skill body length (proxy for depth), snapped to a tier.
function priceFor(slug, bodyLen) {
  const tiers = [150, 300, 450, 700, 1200, 2000];
  const base = Math.min(tiers.length - 1, Math.floor(bodyLen / 900));
  const jitter = hash(slug) % 2; // ±1 tier of deterministic variety
  return tiers[Math.min(tiers.length - 1, base + jitter)];
}
function ratingFor(slug) {
  return Number((0.82 + (hash(slug) % 16) / 100).toFixed(2)); // 0.82–0.97
}

// Minimal frontmatter parser (name + description only — all we need here).
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { fm, body: m[2] };
}

const skills = [];
for (const slug of readdirSync(SKILLS_DIR).sort()) {
  const dir = join(SKILLS_DIR, slug);
  if (!statSync(dir).isDirectory()) continue;
  let raw;
  try {
    raw = readFileSync(join(dir, "SKILL.md"), "utf8");
  } catch {
    continue;
  }
  const { fm, body } = parseFrontmatter(raw);
  const jarvis = slug.startsWith("jarvis-");
  const name = fm.name || slug;
  const desc = fm.description || "";
  const category = categorize(name, desc);
  // The system-prompt fragment injected into a worker when this skill is loaded.
  const systemPrompt =
    `You have loaded the "${name}" skill. ${desc}\n\n` +
    `Apply its methodology to the current task. Full playbook:\n${body.trim().slice(0, 1400)}`;
  skills.push({
    id: slug,
    name,
    category,
    version: "1.0.0",
    systemPrompt,
    priceX402: priceFor(slug, body.length),
    author: jarvis ? "agent:jarvis-lab" : "agent:agent-skills",
    rating: ratingFor(slug),
    description: desc,
    source: `skills/${slug}/SKILL.md`,
    license: "MIT",
  });
}

const catalog = {
  schema: "agentx.skill-catalog/v1",
  count: skills.length,
  categories: [...new Set(skills.map((s) => s.category))].sort(),
  skills,
};
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
console.log(`catalog: ${skills.length} skills → ${OUT}`);
for (const c of catalog.categories) {
  console.log(`  ${c}: ${skills.filter((s) => s.category === c).length}`);
}
