# TALON PIRG — Predictive Intelligence Resource Governor

PIRG recommends and reserves intelligence resources (tokens, context, compute) before and during TALON execution. Hive enforces. World Engine is policy authority. Beekeeper is human approval.

## Web console

Interactive governor used by the preview:

- Scope estimator and token forecaster: deterministic baseline plus P50 / P90 / P99 / hard ceiling
- Budget allocator: project → task → agent / run, prototype weights renormalized when roles drop
- Model selector: quality-aware routing, not cheapest tokens
- Risk sample: prototype retry step (0–3 × 0.18) plus an unfitted lognormal residual so the P99 tail can cross the 1.79× ceiling
- Calibration: record actuals in the browser and replace the illustrative 72% P90 coverage
- Beekeeper review: HOLD, approved with conditions, approved, or rejected

Generation percentiles match the AUTH-001 prototype (`complexity` 1.0 → P50 420,000, P90 688,800, P99 882,000, ceiling 751,800). SAT retrieval is reserved beside generation and added to the ask of Hive.

| Path | Role |
|------|------|
| `src/lib/pirg/forecast.ts` | Forecast, allocation, seeded risk sample |
| `src/components/pirg/console.tsx` | Console UI |
| `src/routes/index.tsx` | Home route |
| `src/styles.css` | Tokens |
| `public/favicon.svg` | Mark |

The route shell (`src/router.tsx`, `src/routes/__root.tsx`) is the TanStack Start document used by the preview. It imports the preview runtime (`@/lib/auth/provider`, `@/components/preview-host-bridge`). Those modules are not in this repo.

## Streamlit prototype

```bash
pip install -r requirements.txt
streamlit run pirg_app.py
```

Self-contained. Same illustrative AUTH-001 baselines. Sidebar controls update the forecast.

## Architecture

| Layer | Role |
|-------|------|
| World Engine | Policy authority, approved scope, dependencies |
| PIRG | Recommend and reserve (forecast, allocate, reforecast) |
| Hive Runtime | Enforce (reservations, hard limits, cancellation, routing) |
| pivot-runner | Isolate execution |
| Beekeeper | Human approval authority |
| Evidence | Actual usage, forecast errors, calibration |

## Next

1. One scoped development task, one model, one agent.
2. Measure actual tokens (or mark estimated).
3. Expand to multi-agent forecasting.
4. Connect to Hive enforcement and SAT Graph retrieval accounting.
5. Prove P90 coverage on real execution records before live enforcement.
