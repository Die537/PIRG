export const TASK_CLASSES = [
  "AUTH subsystem",
  "Feature implementation",
  "Security review",
  "Documentation",
  "Architecture",
] as const;

export type TaskClass = (typeof TASK_CLASSES)[number];

export const MODEL_TIERS = [
  "small local",
  "coding capable",
  "security capable",
  "high-capability large context",
] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];

export const DECISIONS = [
  "HOLD",
  "APPROVED WITH CONDITIONS",
  "APPROVED",
  "REJECTED",
] as const;

export type Decision = (typeof DECISIONS)[number];

/** Illustrative generation baselines from the AUTH-001 prototype. */
const BASE_TOKENS: Record<TaskClass, number> = {
  "AUTH subsystem": 420_000,
  "Feature implementation": 280_000,
  "Security review": 180_000,
  "Documentation": 90_000,
  Architecture: 350_000,
};

export const SCENARIO_ID: Record<TaskClass, string> = {
  "AUTH subsystem": "AUTH-001",
  "Feature implementation": "FEAT-014",
  "Security review": "SEC-007",
  Documentation: "DOCS-003",
  Architecture: "ARCH-002",
};

export const MODEL_ADVICE: Record<ModelTier, string> = {
  "small local":
    "Use for simple extraction and docs. Low VRAM and fast, but complex code may need retries.",
  "coding capable":
    "Preferred for implementation. Balances quality and cost.",
  "security capable":
    "Independent security review path. Do not reuse the model that wrote the code.",
  "high-capability large context":
    "Reserve for architecture and multi-file reasoning. Wider context, higher cost.",
};

export const RECOMMENDED_TIER: Record<TaskClass, ModelTier> = {
  "AUTH subsystem": "coding capable",
  "Feature implementation": "coding capable",
  "Security review": "security capable",
  Documentation: "small local",
  Architecture: "high-capability large context",
};

type RoleSpec = { role: string; weight: number };

const CANONICAL_ROLES: RoleSpec[] = [
  { role: "Architect", weight: 0.11 },
  { role: "Engineer", weight: 0.43 },
  { role: "Test Engineer", weight: 0.26 },
  { role: "Security Auditor", weight: 0.13 },
  { role: "Documentation", weight: 0.07 },
];

const INTEGRATION_ROLE: RoleSpec = { role: "Integration", weight: 0.05 };

export type Allocation = { role: string; tokens: number; share: number };

export type Forecast = {
  scenarioId: string;
  taskClass: TaskClass;
  complexity: number;
  agents: number;
  retrieval: number;
  modelTier: ModelTier;
  recommendedTier: ModelTier;
  /** Generation percentiles. Match the Streamlit prototype exactly. */
  p50: number;
  p90: number;
  p99: number;
  ceiling: number;
  /** What PIRG would hand Hive: generation ceiling plus SAT retrieval. */
  reservation: number;
  allocation: Allocation[];
};

export type Controls = {
  taskClass: TaskClass;
  complexity: number;
  agents: number;
  retrieval: number;
  modelTier: ModelTier;
};

export const DEFAULT_CONTROLS: Controls = {
  taskClass: "AUTH subsystem",
  complexity: 1,
  agents: 5,
  retrieval: 45_000,
  modelTier: "coding capable",
};

function selectRoles(agents: number): RoleSpec[] {
  const n = Math.min(6, Math.max(1, Math.round(agents)));
  if (n >= 6) return [...CANONICAL_ROLES, INTEGRATION_ROLE];
  if (n >= CANONICAL_ROLES.length) return CANONICAL_ROLES;
  const ranked = CANONICAL_ROLES.map((role, index) => ({ role, index })).sort(
    (a, b) => b.role.weight - a.role.weight || a.index - b.index,
  );
  return ranked
    .slice(0, n)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.role);
}

function splitInteger(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const normalized = weights.map((w) => w / sum);
  const raw = normalized.map((w) => total * w);
  const floors = raw.map((value) => Math.floor(value));
  let left = total - floors.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const entry of order) {
    if (left <= 0) break;
    floors[entry.index] += 1;
    left -= 1;
  }
  return floors;
}

export function forecast(controls: Controls): Forecast {
  const complexity = clamp(controls.complexity, 0.5, 2.5);
  const agents = Math.min(6, Math.max(1, Math.round(controls.agents)));
  const retrieval = clamp(Math.round(controls.retrieval), 10_000, 200_000);
  const base = Math.round(BASE_TOKENS[controls.taskClass] * complexity);
  const roles = selectRoles(agents);
  const tokens = splitInteger(
    base,
    roles.map((role) => role.weight),
  );
  const weightSum = roles.reduce((acc, role) => acc + role.weight, 0) || 1;

  return {
    scenarioId: SCENARIO_ID[controls.taskClass],
    taskClass: controls.taskClass,
    complexity,
    agents,
    retrieval,
    modelTier: controls.modelTier,
    recommendedTier: RECOMMENDED_TIER[controls.taskClass],
    p50: base,
    p90: Math.round(base * 1.64),
    p99: Math.round(base * 2.1),
    ceiling: Math.round(base * 1.79),
    reservation: Math.round(base * 1.79) + retrieval,
    allocation: roles.map((role, index) => ({
      role: role.role,
      tokens: tokens[index] ?? 0,
      share: role.weight / weightSum,
    })),
  };
}

export type SimBin = {
  mid: number;
  count: number;
  exceeds: boolean;
};

export type Simulation = {
  n: number;
  seed: number;
  exceedRate: number;
  median: number;
  max: number;
  bins: SimBin[];
};

/**
 * Prototype retry step (0–3 × 0.18) plus a lognormal residual.
 * The residual is not fitted — it exists so the stated P99 (2.1×) can
 * actually cross the hard ceiling (1.79×). Seeded for a stable reading.
 */
const RESIDUAL_SIGMA = 0.28;

export function simulate(
  p50: number,
  ceiling: number,
  n = 500,
  seed = 42,
): Simulation {
  const rng = mulberry32(seed);
  const totals: number[] = [];
  let exceed = 0;
  for (let i = 0; i < n; i++) {
    const retries = Math.floor(rng() * 4);
    const residual = Math.exp(RESIDUAL_SIGMA * boxMuller(rng));
    const total = Math.round(p50 * (1 + retries * 0.18) * residual);
    totals.push(total);
    if (total > ceiling) exceed += 1;
  }
  totals.sort((a, b) => a - b);
  const min = totals[0] ?? 0;
  const max = totals[totals.length - 1] ?? 0;
  const binCount = 16;
  const width = Math.max(1, (max - min) / binCount);
  const bins: SimBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * width;
    const hi = i === binCount - 1 ? max + 1 : lo + width;
    const count = totals.filter((value) => value >= lo && value < hi).length;
    const mid = (lo + Math.min(hi, max)) / 2;
    bins.push({ mid, count, exceeds: mid > ceiling });
  }
  return {
    n,
    seed,
    exceedRate: n === 0 ? 0 : exceed / n,
    median: totals[Math.floor((n - 1) / 2)] ?? 0,
    max,
    bins,
  };
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function full(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMuller(rng: () => number): number {
  let u = rng();
  if (u < 1e-9) u = 1e-9;
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
