import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

st.set_page_config(page_title="PIRG — Predictive Intelligence Resource Governor", layout="wide")

st.title("PIRG — Predictive Intelligence Resource Governor")
st.caption("Native Hive Runtime subsystem · Recommends & reserves · Hive enforces · World Engine policy · Beekeeper approval")

# Sidebar controls
st.sidebar.header("Forecast Controls")
task_class = st.sidebar.selectbox(
    "Task class",
    ["AUTH subsystem", "Feature implementation", "Security review", "Documentation", "Architecture"]
)
complexity = st.sidebar.slider("Complexity multiplier", 0.5, 2.5, 1.0, 0.1)
n_agents = st.sidebar.slider("Parallel agents", 1, 6, 4)
context_retrieval = st.sidebar.slider("SAT Graph context retrieval (tokens)", 10_000, 200_000, 45_000, 5_000)
model_tier = st.sidebar.selectbox(
    "Primary model tier",
    ["small local", "coding capable", "security capable", "high-capability large context"]
)

# Deterministic baseline + probabilistic forecast (illustrative AUTH-001 style)
base_tokens = {
    "AUTH subsystem": 420_000,
    "Feature implementation": 280_000,
    "Security review": 180_000,
    "Documentation": 90_000,
    "Architecture": 350_000,
}[task_class]

base = int(base_tokens * complexity)
p50 = base
p90 = int(base * 1.64)
p99 = int(base * 2.1)
ceiling = int(base * 1.79)

st.subheader("Token Forecast")
col1, col2, col3, col4 = st.columns(4)
col1.metric("P50 estimate", f"{p50:,}")
col2.metric("P90 estimate", f"{p90:,}")
col3.metric("P99 estimate", f"{p99:,}")
col4.metric("Hard ceiling", f"{ceiling:,}")

# Agent allocation (project → task → agent / run)
roles = ["Architect", "Engineer", "Test Engineer", "Security Auditor", "Documentation"]
weights = [0.11, 0.43, 0.26, 0.13, 0.07]
alloc = [int(p50 * w) for w in weights]

alloc_df = pd.DataFrame({"Role": roles, "Allocated tokens": alloc})
st.subheader("Agent / Run Allocation (baseline)")
st.dataframe(alloc_df, use_container_width=True)

fig_alloc = px.bar(alloc_df, x="Role", y="Allocated tokens", title="Baseline allocation by role")
st.plotly_chart(fig_alloc, use_container_width=True)

# Model selector guidance
st.subheader("Model Selector Recommendation")
model_advice = {
    "small local": "Use for simple extraction / docs. Low VRAM, fast, but may require retries on complex code.",
    "coding capable": "Preferred for implementation tasks. Balances quality and cost.",
    "security capable": "Independent security review path. Do not reuse the same model that wrote the code.",
    "high-capability large context": "Reserve for architecture and multi-file reasoning. Higher context window, higher cost.",
}
st.info(model_advice[model_tier])
st.caption(f"Context retrieval budget: {context_retrieval:,} tokens (SAT Graph selected, not full repo dump)")

# Monte Carlo risk simulator
st.subheader("Risk Simulator (illustrative Monte Carlo)")
n_sims = 500
rng = np.random.default_rng(42)
retries = rng.integers(0, 4, size=n_sims)
failure_mult = 1 + retries * 0.18
sim_totals = (p50 * failure_mult).astype(int)
exceed = (sim_totals > ceiling).mean()

fig_mc = go.Figure()
fig_mc.add_trace(go.Histogram(x=sim_totals, name="Simulated total"))
fig_mc.add_vline(x=ceiling, line_dash="dash", annotation_text="Hard ceiling")
fig_mc.update_layout(
    title=f"Monte Carlo (n={n_sims}) · P(exceed ceiling) ≈ {exceed:.1%}",
    xaxis_title="Total tokens"
)
st.plotly_chart(fig_mc, use_container_width=True)

st.warning(
    "If projected consumption exceeds the approved ceiling, Hive pauses new work and requests Beekeeper authorization. "
    "Existing tasks are not auto-declared complete."
)

# Calibration placeholder
st.subheader("Calibration (historical forecast coverage)")
st.caption("Requires actual execution traces in DuckDB. Placeholder until measured data exists.")
st.progress(0.72, text="Illustrative P90 coverage on similar task class: ~72% (needs real traces)")

# Beekeeper review panel
st.subheader("Beekeeper Review Panel")
with st.expander("Review scope and checks", expanded=False):
    st.markdown("""
**Scope:** Resource forecast and reservation for the named task.  
Does not approve release publication, canonical SAT-Graph mutation, or schema changes.

**Checks:**
- Runtime lane matches factory contract
- No Docker path for this approval
- Commands via governed wrapper
- Writeback targets explicit and bounded
- Approval does not expand to production enablement outside named gate

**Decision:** Requires Beekeeper sign-off before Hive turns reservation into execution.
""")

decision = st.radio("Beekeeper decision", ["HOLD", "APPROVED WITH CONDITIONS", "APPROVED", "REJECTED"], index=0)
if decision != "HOLD":
    st.success(f"Recorded decision: {decision}. Link this approval from the run log and evidence artifact.")
else:
    st.info("Held pending Beekeeper review. No reservation promoted to execution.")

st.divider()
st.caption(
    "Prototype only · Numbers are illustrative · Start with one task / one model / one agent and measure actuals "
    "before enabling live enforcement."
)
