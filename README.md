# TALON PIRG — Predictive Intelligence Resource Governor

Prototype web application for the PIRG subsystem described for TALON / Hive Runtime.

## What it demonstrates

- **Scope Estimator + Token Forecaster**: Deterministic baseline + probabilistic P50 / P90 / P99 / hard ceiling
- **Budget Allocator**: Project → Task → Agent / Run reservation hierarchy
- **Model Selector**: Quality-aware routing (not just cheapest tokens)
- **Risk Simulator**: Monte Carlo illustration of retries and failures
- **Calibration**: Historical forecast vs actual comparison (Bayesian-style feedback)
- **Beekeeper Review**: Human approval boundary with the provided template structure

## Architecture reminder

| Layer | Role |
|-------|------|
| World Engine | Policy authority, approved scope, dependencies |
| PIRG (this app) | Recommend & reserve (forecast, allocate, reforecast) |
| Hive Runtime | Enforce (reservations, hard limits, cancellation, routing) |
| pivot-runner | Isolate execution (namespaces, pivot_root, resource limits) |
| Beekeeper | Human approval authority |
| Evidence / DuckDB | Actual usage, forecast errors, calibration |

## Run

```bash
pip install -r requirements.txt
streamlit run pirg_app.py
```

The app is self-contained and uses illustrative numbers derived from the AUTH-001 example. Adjust complexity, agents, and task class in the sidebar to see forecasts update.

## Next steps (as recommended)

1. One scoped development task, one model, one agent.
2. Measure actual tokens (or mark estimated).
3. Expand to multi-agent forecasting.
4. Connect to real Hive Go enforcement and SAT Graph retrieval accounting.
5. Prove P90 coverage on real execution records before full live enforcement.

## Files

- `pirg_app.py` — Streamlit application
- `requirements.txt` — dependencies
