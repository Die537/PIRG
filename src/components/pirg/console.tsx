import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DECISIONS,
  DEFAULT_CONTROLS,
  MODEL_ADVICE,
  MODEL_TIERS,
  TASK_CLASSES,
  compact,
  forecast,
  full,
  simulate,
  type Controls,
  type Decision,
} from "@/lib/pirg/forecast";

type ActualRecord = {
  id: string;
  at: string;
  taskClass: string;
  scenarioId: string;
  p50: number;
  p90: number;
  ceiling: number;
  actual: number;
};

type DecisionRecord = {
  id: string;
  at: string;
  decision: Decision;
  scenarioId: string;
  taskClass: string;
  ceiling: number;
  modelTier: string;
};

const STORE_KEY = "pirg.ledger.v1";

const LANES = [
  { name: "World Engine", role: "Policy" },
  { name: "PIRG", role: "Recommend", current: true },
  { name: "Hive", role: "Enforce" },
  { name: "pivot-runner", role: "Isolate" },
  { name: "Beekeeper", role: "Approve" },
  { name: "Evidence", role: "Calibrate" },
] as const;

const CHECKS = [
  "Runtime lane matches the factory contract",
  "No Docker path on this approval",
  "Commands go through the governed wrapper",
  "Writeback targets are explicit and bounded",
  "Approval does not enable production outside the named gate",
];

export function Console() {
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [seed, setSeed] = useState(42);
  const [decision, setDecision] = useState<Decision>("HOLD");
  const [actualInput, setActualInput] = useState("");
  const [actuals, setActuals] = useState<ActualRecord[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const view = useMemo(() => forecast(controls), [controls]);
  const sim = useMemo(
    () => simulate(view.p50, view.ceiling, 500, seed),
    [view.p50, view.ceiling, seed],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          actuals?: ActualRecord[];
          decisions?: DecisionRecord[];
        };
        if (Array.isArray(parsed.actuals)) setActuals(parsed.actuals.slice(0, 20));
        if (Array.isArray(parsed.decisions)) setDecisions(parsed.decisions.slice(0, 20));
      }
    } catch {
      /* ignore a corrupt local ledger */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ actuals, decisions }));
  }, [actuals, decisions, ready]);

  const measured = actuals.length > 0;
  const coverage = measured
    ? actuals.filter((row) => row.actual <= row.p90).length / actuals.length
    : 0.72;
  const meanAbs =
    measured
      ? actuals.reduce((acc, row) => acc + Math.abs(row.actual - row.p50) / row.p50, 0) /
        actuals.length
      : null;

  function patch(partial: Partial<Controls>) {
    setNote(null);
    setControls((current) => ({ ...current, ...partial }));
  }

  function recordDecision(next: Decision) {
    setDecision(next);
    if (next === "HOLD") {
      setNote("Held. No reservation is promoted to execution.");
      return;
    }
    const entry: DecisionRecord = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      decision: next,
      scenarioId: view.scenarioId,
      taskClass: view.taskClass,
      ceiling: view.reservation,
      modelTier: view.modelTier,
    };
    setDecisions((rows) => [entry, ...rows].slice(0, 20));
    setNote(`Recorded ${next}. Link it from the run log before Hive enforces.`);
  }

  function recordActual() {
    const actual = Number(actualInput.replace(/,/g, ""));
    if (!Number.isFinite(actual) || actual <= 0) {
      setNote("Enter a positive token count.");
      return;
    }
    const entry: ActualRecord = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      taskClass: view.taskClass,
      scenarioId: view.scenarioId,
      p50: view.p50,
      p90: view.p90,
      ceiling: view.ceiling,
      actual: Math.round(actual),
    };
    setActuals((rows) => [entry, ...rows].slice(0, 20));
    setActualInput("");
    setNote(
      actual <= view.p90
        ? "Actual landed inside P90."
        : "Actual broke P90. Coverage will drop until the forecast is recalibrated.",
    );
  }

  const posture =
    decision === "REJECTED"
      ? "Rejected. Hive must not open a run."
      : decision === "HOLD"
        ? "Draft only. Hive does not execute a held reservation."
        : sim.exceedRate >= 0.2
          ? "Approved on paper, but the tail is fat. Hive should pause new work and re-ask Beekeeper."
          : "Reservation can be enforced. Existing tasks are not auto-completed if the ceiling is later hit.";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            TALON · Hive Runtime
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight text-fg sm:text-4xl">
            PIRG
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
            Predictive Intelligence Resource Governor. Recommends and reserves.
            Hive enforces. World Engine sets policy. Beekeeper approves.
          </p>
        </div>
        <p className="font-mono text-xs text-subtle">
          Scenario {view.scenarioId}
        </p>
      </header>

      <ol className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {LANES.map((lane) => (
          <li
            key={lane.name}
            className={`min-w-28 shrink-0 rounded-md border px-3 py-2 ${
              "current" in lane && lane.current
                ? "border-primary bg-surface text-fg"
                : "border-border bg-surface text-muted"
            }`}
          >
            <p className="text-sm font-medium">{lane.name}</p>
            <p className="font-mono text-xs text-subtle">{lane.role}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-medium tracking-tight">Forecast controls</h2>
          <p className="mt-1 text-sm text-muted">
            Generation percentiles follow the prototype. Retrieval is reserved beside them.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-muted">Task class</span>
              <select
                className="h-11 rounded-md border border-border bg-surface-2 px-3 text-fg"
                value={controls.taskClass}
                onChange={(event) =>
                  patch({ taskClass: event.target.value as Controls["taskClass"] })
                }
              >
                {TASK_CLASSES.map((task) => (
                  <option key={task} value={task}>
                    {task}
                  </option>
                ))}
              </select>
            </label>

            <Slider
              label="Complexity"
              valueLabel={`${controls.complexity.toFixed(1)}×`}
              min={0.5}
              max={2.5}
              step={0.1}
              value={controls.complexity}
              onChange={(complexity) => patch({ complexity })}
            />
            <Slider
              label="Parallel agents"
              valueLabel={String(controls.agents)}
              min={1}
              max={6}
              step={1}
              value={controls.agents}
              onChange={(agents) => patch({ agents })}
            />
            <Slider
              label="SAT Graph retrieval"
              valueLabel={`${compact(controls.retrieval)} tokens`}
              min={10_000}
              max={200_000}
              step={5_000}
              value={controls.retrieval}
              onChange={(retrieval) => patch({ retrieval })}
            />

            <label className="grid gap-2 text-sm">
              <span className="text-muted">Primary model tier</span>
              <select
                className="h-11 rounded-md border border-border bg-surface-2 px-3 text-fg"
                value={controls.modelTier}
                onChange={(event) =>
                  patch({ modelTier: event.target.value as Controls["modelTier"] })
                }
              >
                {MODEL_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="grid gap-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="P50" value={full(view.p50)} hint="Baseline" />
            <Metric label="P90" value={full(view.p90)} hint="1.64×" />
            <Metric label="P99" value={full(view.p99)} hint="2.10×" />
            <Metric label="Hard ceiling" value={full(view.ceiling)} hint="1.79×" />
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium tracking-tight">Reservation ticket</h2>
              <p className="font-mono text-xs text-subtle">{view.scenarioId}</p>
            </div>
            <p className="mt-2 text-sm text-muted">
              Hard ceiling sits between P90 and P99. The tail is an escalation, not a silent overrun.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat k="Generation ceiling" v={full(view.ceiling)} />
              <Stat k="SAT retrieval" v={full(view.retrieval)} />
              <Stat k="Ask of Hive" v={full(view.reservation)} />
            </dl>
            <p className="mt-4 text-sm text-fg">{posture}</p>
          </section>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Agent allocation</h2>
            <p className="mt-1 text-sm text-muted">
              Project TALON, task {view.taskClass}, {view.agents}{" "}
              {view.agents === 1 ? "run" : "runs"}. Shares are the prototype weights,
              renormalized when a role is dropped.
            </p>
          </div>
        </div>
        <div className="mt-4 h-56 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={view.allocation}
              layout="vertical"
              margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
            >
              <XAxis
                type="number"
                tickFormatter={compact}
                stroke="var(--color-subtle)"
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="role"
                width={118}
                stroke="var(--color-subtle)"
                tick={{ fill: "var(--color-fg)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--color-surface-2)" }}
                formatter={(value) => [full(Number(value)), "Tokens"]}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="tokens" radius={[0, 8, 8, 0]} fill="var(--color-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {view.allocation.map((row) => (
            <li key={row.role} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span>{row.role}</span>
              <span className="font-mono text-muted">
                {full(row.tokens)} · {Math.round(row.share * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-medium tracking-tight">Model selector</h2>
          <p className="mt-3 text-sm text-fg">{MODEL_ADVICE[view.modelTier]}</p>
          <p className="mt-3 text-sm text-muted">
            Recommended for this class: {view.recommendedTier}.
            {view.modelTier === view.recommendedTier
              ? " Current selection matches."
              : " Current selection differs — quality, not price, is the routing rule."}
          </p>
          <p className="mt-3 font-mono text-xs text-subtle">
            Context retrieval budget {full(view.retrieval)} tokens. Selected graph, not a repo dump.
          </p>
        </article>

        <article className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-medium tracking-tight">Risk simulator</h2>
            <button
              type="button"
              className="h-11 shrink-0 rounded-md border border-border bg-surface-2 px-3 text-sm text-fg"
              onClick={() => setSeed((current) => current + 1)}
            >
              Resample
            </button>
          </div>
          <p className="mt-2 font-mono text-sm text-fg">
            P(exceed ceiling) {pct(sim.exceedRate)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {sim.n} draws · seed {sim.seed} · median {compact(sim.median)} · max {compact(sim.max)}
          </p>
          <div className="mt-3 h-40 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sim.bins} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="mid"
                  tickFormatter={compact}
                  stroke="var(--color-subtle)"
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={3}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => [value, "Draws"]}
                  labelFormatter={(label) => compact(Number(label))}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {sim.bins.map((bin) => (
                    <Cell
                      key={bin.mid}
                      fill={bin.exceeds ? "var(--color-alert)" : "var(--color-primary)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-subtle">
            Rust bars sit past the hard ceiling. Retries are the prototype step (0–3 × 0.18) plus an
            unfitted lognormal residual so the P99 tail can actually cross 1.79×.
          </p>
          {sim.exceedRate > 0 ? (
            <p className="mt-3 text-sm text-alert">
              If projected consumption exceeds the approved ceiling, Hive pauses new work and asks
              Beekeeper. Tasks already running are not declared complete.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              This sample stays under the ceiling. Resample or raise complexity to see an escalation.
            </p>
          )}
        </article>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium tracking-tight">Calibration</h2>
        <p className="mt-1 text-sm text-muted">
          {measured
            ? `${actuals.length} local actual${actuals.length === 1 ? "" : "s"}. This browser only — not the DuckDB evidence ledger.`
            : "No measured traces yet. 72% is the illustrative P90 coverage from the prototype, not a fit."}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted">P90 coverage</span>
              <span className="font-mono text-fg">{pct(coverage)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.round(coverage * 100)}%` }}
              />
            </div>
            {meanAbs !== null ? (
              <p className="mt-2 font-mono text-xs text-subtle">
                Mean absolute error vs P50 {pct(meanAbs)}
              </p>
            ) : null}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              recordActual();
            }}
          >
            <label className="sr-only" htmlFor="actual-tokens">
              Actual tokens
            </label>
            <input
              id="actual-tokens"
              inputMode="numeric"
              placeholder="Actual tokens"
              value={actualInput}
              onChange={(event) => setActualInput(event.target.value)}
              className="h-11 w-full min-w-0 rounded-md border border-border bg-surface-2 px-3 font-mono text-sm text-fg placeholder:text-subtle sm:w-40"
            />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
            >
              Record
            </button>
          </form>
        </div>
        {actuals.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {actuals.slice(0, 5).map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span>
                  {row.scenarioId}
                  <span className="text-muted"> · {row.taskClass}</span>
                </span>
                <span className={`font-mono ${row.actual <= row.p90 ? "text-ok" : "text-alert"}`}>
                  {full(row.actual)} vs P90 {full(row.p90)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium tracking-tight">Beekeeper review</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Scope is the resource forecast and reservation for {view.scenarioId}. It does not approve
          release publication, canonical SAT-Graph mutation, or schema changes.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {CHECKS.map((check) => (
            <li key={check} className="rounded-md bg-surface-2 px-3 py-3 text-sm text-fg">
              {check}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Beekeeper decision">
          {DECISIONS.map((option) => {
            const selected = decision === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => recordDecision(option)}
                className={`h-11 rounded-md border px-3 text-left text-sm font-medium ${
                  selected
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border bg-surface-2 text-fg"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
        {note ? <p className="mt-3 text-sm text-fg">{note}</p> : null}
        {decisions.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {decisions.slice(0, 4).map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span>{row.decision}</span>
                <span className="font-mono text-xs text-subtle">
                  {row.scenarioId} · ceiling {compact(row.ceiling)} · {row.modelTier}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="mt-6 text-xs text-subtle">
        Prototype numbers from the PIRG repository. One task, one model, one measured actual — then
        widen. Live Hive enforcement is not connected.
      </p>
    </main>
  );
}

function Slider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-fg">{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-lg border border-border bg-surface px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-medium tracking-tight text-fg tabular-nums sm:text-xl">
        {value}
      </p>
      <p className="font-mono text-xs text-subtle">{hint}</p>
    </article>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-3">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-1 font-mono text-base text-fg tabular-nums">{v}</dd>
    </div>
  );
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color: "var(--color-fg)",
  fontSize: 12,
};
