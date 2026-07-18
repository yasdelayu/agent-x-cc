import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Marketplace, Skill, SkillCategory } from "../orchestrator/types.js";
import type { LedgerImpl } from "../ledger/index.js";
import { JsonStore, storePath } from "../store/jsonStore.js";
import { ENGINEERING_CATALOG } from "./catalog.js";

interface MarketplaceState {
  skills: Skill[];
}

/**
 * The skills marketplace. A Skill is a purchasable system-prompt fragment that
 * gets injected into a worker before it runs. Loading a skill charges the buyer
 * and credits the author on the X402 ledger — so publishing good skills is a
 * revenue stream, exactly the "agents trading with agents" primitive.
 */
export class MarketplaceImpl implements Marketplace {
  private readonly store: JsonStore<MarketplaceState>;

  constructor(
    private readonly ledger: LedgerImpl,
    path = storePath("skills")
  ) {
    this.store = new JsonStore<MarketplaceState>(path, {
      skills: [...SEED_SKILLS, ...ENGINEERING_CATALOG],
    });
  }

  async list(category?: SkillCategory): Promise<Skill[]> {
    const all = this.store.read().skills;
    return category ? all.filter((s) => s.category === category) : all;
  }

  async get(skillId: string): Promise<Skill | undefined> {
    return this.store.read().skills.find((s) => s.id === skillId);
  }

  async publish(skill: Skill): Promise<Skill> {
    this.store.write((s) => {
      const idx = s.skills.findIndex((x) => x.id === skill.id);
      if (idx >= 0) s.skills[idx] = skill;
      else s.skills.push(skill);
    });
    return skill;
  }

  /** Charge the buyer, pay the author's royalty, hand back the loadable skill. */
  async load(skillId: string, buyer: string): Promise<Skill> {
    const skill = await this.get(skillId);
    if (!skill) throw new Error(`unknown skill "${skillId}"`);
    if (skill.priceX402 > 0 && buyer !== skill.author) {
      await this.ledger.transfer(buyer, skill.author, skill.priceX402);
    }
    return skill;
  }
}

/** Starter catalogue mirroring the AgentX marketplace pitch. */
export const SEED_SKILLS: Skill[] = [
  {
    id: "nlp-sentiment-v4",
    name: "Sentiment Analysis v4.2",
    category: "nlp",
    version: "4.2.0",
    systemPrompt:
      "You are a sentiment analysis specialist. Classify tone as positive/negative/neutral with a confidence score and a one-line justification.",
    preferredEngine: "mock-smart",
    priceX402: 450,
    author: "agent:nlp-labs",
    rating: 0.91,
  },
  {
    id: "coding-python-omega",
    name: "Python Code Generator Omega",
    category: "coding",
    version: "1.0.0",
    systemPrompt:
      "You are an expert Python engineer. Produce clean, typed, tested code. Prefer stdlib, document edge cases, and never leave TODOs.",
    preferredEngine: "mock-smart",
    priceX402: 1200,
    author: "agent:codeforge",
    rating: 0.88,
  },
  {
    id: "finance-arbitrage-x",
    name: "Crypto Arbitrage Algo X",
    category: "finance",
    version: "2.1.0",
    systemPrompt:
      "You are a quantitative arbitrage strategist. Identify price dislocations, account for fees and slippage, and size positions by risk.",
    preferredEngine: "mock-smart",
    priceX402: 5000,
    author: "agent:quantpit",
    rating: 0.84,
  },
  {
    id: "logic-decompose",
    name: "Task Decomposition Logic",
    category: "logic",
    version: "1.3.0",
    systemPrompt:
      "You are a planning engine. Break a goal into ordered, independently-verifiable sub-tasks with clear acceptance criteria.",
    preferredEngine: "mock-fast",
    priceX402: 300,
    author: "agent:planner",
    rating: 0.9,
  },
];
