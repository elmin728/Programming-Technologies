import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend
} from "recharts";

// ── Real benchmark data ──────────────────────────────────────────
const DATA = {
  meta: { num_clients: 10, ops_per_client: 300, universe_size: 1000, cache_capacity: 200 },
  benchmarks: [
    { label: "No Cache",      cache_type: "none",    cache_hit_rate: 0.000, avg_latency_ms: 5.346, p95_latency_ms: 5.889, p99_latency_ms: 6.307, throughput_ops_s: 1825.9,  db_fetches: 3000, cache_hits: 0,    cache_misses: 3000, cache_evictions: 0 },
    { label: "Single Lock",   cache_type: "single",  cache_hit_rate: 0.810, avg_latency_ms: 1.201, p95_latency_ms: 7.389, p99_latency_ms: 10.337,throughput_ops_s: 6403.2,  db_fetches: 518,  cache_hits: 2204, cache_misses: 518,  cache_evictions: 347 },
    { label: "Sharded (8)",   cache_type: "sharded", cache_hit_rate: 0.803, avg_latency_ms: 1.287, p95_latency_ms: 7.464, p99_latency_ms: 12.842,throughput_ops_s: 5953.8,  db_fetches: 538,  cache_hits: 2198, cache_misses: 538,  cache_evictions: 365 },
    { label: "Sharded (16)",  cache_type: "sharded", cache_hit_rate: 0.796, avg_latency_ms: 1.264, p95_latency_ms: 7.212, p99_latency_ms: 11.140,throughput_ops_s: 6208.8,  db_fetches: 550,  cache_hits: 2140, cache_misses: 550,  cache_evictions: 408 },
    { label: "Sharded+TTL",   cache_type: "sharded", cache_hit_rate: 0.694, avg_latency_ms: 1.624, p95_latency_ms: 6.580, p99_latency_ms: 8.223, throughput_ops_s: 5146.9,  db_fetches: 822,  cache_hits: 1862, cache_misses: 822,  cache_evictions: 369 },
  ],
  pattern_comparison: [
    { pattern: "uniform",    hit_rate: 0.1744, avg_latency_ms: 4.022, p95_latency_ms: 5.745, throughput: 2400.5 },
    { pattern: "zipf",       hit_rate: 0.7948, avg_latency_ms: 1.250, p95_latency_ms: 7.311, throughput: 5918.6 },
    { pattern: "zipf_hot",   hit_rate: 0.9682, avg_latency_ms: 0.671, p95_latency_ms: 0.012, throughput: 8336.7 },
    { pattern: "sequential", hit_rate: 0.3690, avg_latency_ms: 3.142, p95_latency_ms: 5.708, throughput: 3157.4 },
  ],
  capacity_sweep: [
    { capacity: 10,   hit_rate: 0.2706 },
    { capacity: 25,   hit_rate: 0.5214 },
    { capacity: 50,   hit_rate: 0.6533 },
    { capacity: 100,  hit_rate: 0.7309 },
    { capacity: 200,  hit_rate: 0.7841 },
    { capacity: 400,  hit_rate: 0.8052 },
    { capacity: 600,  hit_rate: 0.8206 },
    { capacity: 800,  hit_rate: 0.8205 },
    { capacity: 1000, hit_rate: 0.8152 },
  ],
};

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bg:      "#0A0E1A",
  panel:   "#111827",
  border:  "#1E2A3A",
  accent:  "#00D4FF",
  green:   "#00FF9F",
  amber:   "#FFB830",
  red:     "#FF4D6D",
  muted:   "#4A5568",
  text:    "#E2E8F0",
  textDim: "#718096",
};

const PALETTE = ["#FF4D6D", "#00D4FF", "#FFB830", "#00FF9F", "#A78BFA"];

// ── Custom tooltip ─────────────────────────────────────────────
const ChartTip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1E2A3A", border: `1px solid ${C.border}`, padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
      <p style={{ color: C.textDim, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || C.accent, margin: "2px 0" }}>
          {p.name}: <strong>{fmt ? fmt(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Stat card ─────────────────────────────────────────────────
const Stat = ({ label, value, sub, color = C.accent, glow = false }) => (
  <div style={{
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "18px 22px", flex: 1, minWidth: 140,
    boxShadow: glow ? `0 0 24px ${color}22` : "none",
    borderTop: `2px solid ${color}`,
  }}>
    <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>{sub}</div>}
  </div>
);

// ── Section heading ──────────────────────────────────────────
const SectionHead = ({ title, sub }) => (
  <div style={{ marginBottom: 20 }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
    {sub && <p style={{ fontSize: 13, color: C.textDim, margin: "4px 0 0" }}>{sub}</p>}
  </div>
);

// ── Panel wrapper ────────────────────────────────────────────
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: "24px 28px", ...style
  }}>
    {children}
  </div>
);

// ── THEORY CONTENT ────────────────────────────────────────────
const theoryBlocks = [
  {
    title: "LRU Fundamentals",
    icon: "⬡",
    color: C.accent,
    items: [
      { term: "Data Structure", desc: "HashMap for O(1) key lookup + Doubly Linked List for O(1) LRU eviction. HashMap values hold pointers to list nodes." },
      { term: "Invariant", desc: "List head = LRU (evict next). List tail = MRU (most recently accessed). Every get/put promotes the node to tail." },
      { term: "Eviction", desc: "When size > capacity, pop the head node and delete its key from the HashMap. Cost is O(1) amortised." },
      { term: "OrderedDict", desc: "Python's OrderedDict implements this pattern natively: move_to_end(key) = promote to MRU; popitem(last=False) = evict LRU." },
    ]
  },
  {
    title: "Concurrency Design",
    icon: "⚡",
    color: C.amber,
    items: [
      { term: "Coarse Lock", desc: "One mutex protects the whole cache. Simple. Correct. But all threads serialise on every op — hot lock contention under high concurrency." },
      { term: "Sharded Lock", desc: "N independent shards, each with its own lock. Key is hashed to a shard. Contention probability drops by ~1/N. False sharing is eliminated." },
      { term: "RW Lock", desc: "Readers acquire a shared lock (many concurrent readers OK). Writers acquire an exclusive lock (blocks all others). Best for read-heavy workloads." },
      { term: "Promotion Problem", desc: "get() mutates state (promotes MRU), so it needs a write lock even with RW-locks. Solution: batch promotions or use approximate LRU." },
    ]
  },
  {
    title: "Performance & Zipf",
    icon: "◈",
    color: C.green,
    items: [
      { term: "Zipf Distribution", desc: "Real-world access follows Zipf's law: the k-th most popular item is accessed 1/kᵅ as often as the most popular. α≈1 for web traffic, higher for hot CDN content." },
      { term: "Hit Rate vs Capacity", desc: "With Zipf traffic, a cache storing just 20% of the universe can achieve 80%+ hit rate. Diminishing returns after ~40% due to the long tail." },
      { term: "Uniform → Low Hits", desc: "Uniform random access gives hit rate ≈ capacity/universe. Every key equally hot, so LRU offers no benefit over random eviction." },
      { term: "Sequential Thrashing", desc: "Sequential scans are LRU's worst case. Each access evicts something useful. Mitigations: scan-resistant LRU variants (ARC, LIRS, TinyLFU)." },
    ]
  },
  {
    title: "Testing Strategy",
    icon: "✦",
    color: "#A78BFA",
    items: [
      { term: "Invariant Checks", desc: "After every op: len(map) == len(list), map keys ⊆ list nodes, LRU order matches access history. Run after each randomized sequence." },
      { term: "Concurrent Fuzzing", desc: "N threads each do M random get/put/delete. Check: no crash, no corrupted values, no deadlock. Use threading.Barrier for simultaneous start." },
      { term: "Property Tests", desc: "Property: after put(k,v), get(k) returns v. After capacity+1 inserts, the first-inserted key must be gone (LRU evicted). Verify with pytest-hypothesis." },
      { term: "Shard Consistency", desc: "Verify that key k always routes to the same shard (deterministic hashing). Check total capacity = sum of shard capacities. Verify no cross-shard contamination." },
    ]
  },
];

const TheoryView = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
    {theoryBlocks.map((block) => (
      <Panel key={block.title}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 20, color: block.color }}>{block.icon}</span>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: block.color, letterSpacing: "-0.01em" }}>{block.title}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {block.items.map(it => (
            <div key={it.term}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "monospace", marginBottom: 3 }}>{it.term}</div>
              <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>{it.desc}</div>
            </div>
          ))}
        </div>
      </Panel>
    ))}
  </div>
);

// ── BENCHMARK TAB ────────────────────────────────────────────
const BenchmarkView = () => {
  const [metric, setMetric] = useState("throughput_ops_s");

  const metricMeta = {
    throughput_ops_s: { label: "Throughput (ops/s)", fmt: v => v.toLocaleString(), color: C.accent },
    avg_latency_ms:   { label: "Avg Latency (ms)",   fmt: v => v.toFixed(2) + " ms", color: C.amber },
    p95_latency_ms:   { label: "p95 Latency (ms)",   fmt: v => v.toFixed(2) + " ms", color: C.red },
    cache_hit_rate:   { label: "Hit Rate",            fmt: v => (v * 100).toFixed(1) + "%", color: C.green },
  };

  const mm = metricMeta[metric];

  // speedup vs no-cache
  const noCache = DATA.benchmarks[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 14 }}>
        <Stat label="Speedup (Single Lock vs No Cache)"
              value={`${(DATA.benchmarks[1].throughput_ops_s / noCache.throughput_ops_s).toFixed(1)}×`}
              color={C.green} glow />
        <Stat label="DB Fetches Saved"
              value={`${(((noCache.db_fetches - DATA.benchmarks[1].db_fetches) / noCache.db_fetches) * 100).toFixed(0)}%`}
              sub="Single Lock vs baseline" color={C.accent} />
        <Stat label="Best Hit Rate"
              value="81%"
              sub="Single Lock, Zipf pattern" color={C.amber} />
        <Stat label="Best Throughput"
              value="6,403"
              sub="ops/s — Single Lock" color="#A78BFA" />
      </div>

      {/* Metric selector */}
      <div style={{ display: "flex", gap: 8 }}>
        {Object.entries(metricMeta).map(([k, v]) => (
          <button key={k} onClick={() => setMetric(k)} style={{
            padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${metric === k ? v.color : C.border}`,
            background: metric === k ? `${v.color}18` : "transparent",
            color: metric === k ? v.color : C.textDim, transition: "all 0.2s",
          }}>{v.label}</button>
        ))}
      </div>

      {/* Main bar chart */}
      <Panel>
        <SectionHead title={`Cache Strategy Comparison — ${mm.label}`}
                     sub="10 concurrent clients, 300 ops each, Zipf access pattern (α=1.2), universe=1000 keys, capacity=200" />
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={DATA.benchmarks} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 13 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip fmt={mm.fmt} />} cursor={{ fill: "#ffffff08" }} />
            <Bar dataKey={metric} name={mm.label} radius={[6, 6, 0, 0]}>
              {DATA.benchmarks.map((_, i) => (
                <Cell key={i} fill={i === 0 ? C.red : PALETTE[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* Latency comparison table */}
      <Panel>
        <SectionHead title="Full Latency Profile" sub="All percentiles — lower is better" />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Strategy", "Avg", "p50", "p95", "p99", "DB Fetches", "Evictions"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: C.textDim, fontWeight: 600, fontSize: 11, letterSpacing: "0.08em" }}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DATA.benchmarks.map((r, i) => (
              <tr key={r.label} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? "#ffffff04" : "transparent" }}>
                <td style={{ padding: "10px 12px", color: PALETTE[i], fontWeight: 700, fontFamily: "monospace" }}>{r.label}</td>
                <td style={{ padding: "10px 12px", color: C.text, fontFamily: "monospace" }}>{r.avg_latency_ms.toFixed(3)} ms</td>
                <td style={{ padding: "10px 12px", color: C.textDim, fontFamily: "monospace" }}>
                  {DATA.benchmarks[i].p50_latency_ms !== undefined ? "—" : "—"}
                </td>
                <td style={{ padding: "10px 12px", color: r.p95_latency_ms > 6 ? C.amber : C.text, fontFamily: "monospace" }}>{r.p95_latency_ms.toFixed(3)} ms</td>
                <td style={{ padding: "10px 12px", color: r.p99_latency_ms > 10 ? C.red : C.text, fontFamily: "monospace" }}>{r.p99_latency_ms.toFixed(3)} ms</td>
                <td style={{ padding: "10px 12px", color: C.textDim, fontFamily: "monospace" }}>{r.db_fetches.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", color: C.textDim, fontFamily: "monospace" }}>{r.cache_evictions.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
};

// ── PATTERNS TAB ─────────────────────────────────────────────
const PatternsView = () => {
  const radarData = DATA.pattern_comparison.map(p => ({
    pattern: p.pattern === "zipf_hot" ? "zipf (hot)" : p.pattern,
    "Hit Rate %": +(p.hit_rate * 100).toFixed(1),
    "Throughput (×10²)": +(p.throughput / 100).toFixed(1),
    "Inv. Latency": +(10 / p.avg_latency_ms).toFixed(2),
  }));

  const patternInfo = {
    uniform:    { color: C.red,   desc: "Every key equally likely. Hit rate ≈ capacity/universe. LRU provides no locality benefit." },
    zipf:       { color: C.accent,desc: "Power-law distribution (α=1.2). Top 20% keys account for ~80% of accesses. Classic web traffic." },
    zipf_hot:   { color: C.green, desc: "Heavily skewed Zipf (α=2.0). Top 5% keys dominate. Ideal for LRU — near-perfect hit rate." },
    sequential: { color: C.amber, desc: "Strict scan order. LRU thrashes: each access evicts something needed soon. Classic adversarial pattern." },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Pattern cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
        {DATA.pattern_comparison.map((p) => {
          const info = patternInfo[p.pattern] || {};
          return (
            <Panel key={p.pattern} style={{ borderTop: `2px solid ${info.color}` }}>
              <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{p.pattern}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: info.color, fontFamily: "monospace" }}>
                {(p.hit_rate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: C.textDim, margin: "6px 0" }}>hit rate</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 10 }}>
                <span style={{ color: C.textDim }}>avg <span style={{ color: C.text }}>{p.avg_latency_ms.toFixed(2)}ms</span></span>
                <span style={{ color: C.textDim }}>{p.throughput.toLocaleString()} ops/s</span>
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>{info.desc}</div>
            </Panel>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Bar: Hit rate by pattern */}
        <Panel>
          <SectionHead title="Hit Rate by Access Pattern" sub="Sharded(16), capacity=200, universe=1000" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={DATA.pattern_comparison} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="pattern" tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip fmt={v => `${(v * 100).toFixed(1)}%`} />} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="hit_rate" name="Hit Rate" radius={[6, 6, 0, 0]}>
                {DATA.pattern_comparison.map((p) => (
                  <Cell key={p.pattern} fill={(patternInfo[p.pattern] || {}).color || C.accent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* Radar */}
        <Panel>
          <SectionHead title="Pattern Performance Radar" sub="Normalised multi-metric comparison" />
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="pattern" tick={{ fill: C.textDim, fontSize: 11 }} />
              <Radar name="Hit Rate %" dataKey="Hit Rate %" stroke={C.accent} fill={C.accent} fillOpacity={0.15} />
              <Radar name="Throughput" dataKey="Throughput (×10²)" stroke={C.green} fill={C.green} fillOpacity={0.10} />
              <Radar name="Inv. Latency" dataKey="Inv. Latency" stroke={C.amber} fill={C.amber} fillOpacity={0.10} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.textDim }} />
              <Tooltip content={<ChartTip />} />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
};

// ── CAPACITY TAB ─────────────────────────────────────────────
const CapacityView = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Key insight cards */}
      <div style={{ display: "flex", gap: 14 }}>
        <Stat label="80% hit rate at" value="20%" sub="of universe size (Zipf α=1.2)" color={C.accent} glow />
        <Stat label="Diminishing returns after" value="40%" sub="capacity/universe ratio" color={C.amber} />
        <Stat label="Capacity → ∞ cap" value="~82%" sub="Zipf long-tail ceiling" color={C.green} />
        <Stat label="Zipf concentration" value="α=1.2" sub="top 10% keys → 65% traffic" color="#A78BFA" />
      </div>

      <Panel>
        <SectionHead title="Hit Rate vs Cache Capacity" sub="Zipf access pattern (α=1.2), universe=1000 keys — sharded LRU" />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={DATA.capacity_sweep}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="capacity" tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} label={{ value: "Cache Capacity (# entries)", position: "insideBottom", offset: -4, fill: C.textDim, fontSize: 12 }} />
            <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip fmt={v => `${(v * 100).toFixed(1)}%`} />} />
            <ReferenceLine y={0.8} stroke={C.amber} strokeDasharray="4 4" label={{ value: "80%", position: "right", fill: C.amber, fontSize: 11 }} />
            <Line type="monotone" dataKey="hit_rate" name="Hit Rate" stroke={C.accent} strokeWidth={2.5} dot={{ fill: C.accent, r: 5 }} activeDot={{ r: 7, fill: C.green }} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* Zipf explanation */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Panel>
          <SectionHead title="Why Zipf Enables Small Caches" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>
            <p style={{ margin: 0 }}>Zipf's law says: the k-th most popular item is accessed with probability <span style={{ color: C.accent, fontFamily: "monospace" }}>P(k) ∝ 1/k^α</span>.</p>
            <p style={{ margin: 0 }}>With α=1.2 and universe=1000, the top 200 keys (20%) receive approximately <strong style={{ color: C.green }}>≈78%</strong> of all requests. Caching just those keys achieves near-optimal hit rate.</p>
            <p style={{ margin: 0 }}>This is why CDNs, Redis clusters, and browser caches can be dramatically smaller than the working set they serve — real access patterns are almost never uniform.</p>
            <div style={{ background: "#ffffff06", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: C.accent }}>
              hit_rate ≈ Σ P(k) for k in cached_keys<br/>
              ≈ H(cap, α) / H(universe, α)<br/>
              where H(n,α) = Σ 1/k^α (generalised harmonic)
            </div>
          </div>
        </Panel>
        <Panel>
          <SectionHead title="Practical Sizing Rules" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { ratio: "1–5%",   hitrate: "30–50%",  note: "Minimal cache. Good for bursty, short-lived hotspots." },
              { ratio: "10–20%", hitrate: "65–80%",  note: "Sweet spot for most production caches (cost vs benefit)." },
              { ratio: "20–40%", hitrate: "78–82%",  note: "Diminishing returns begin. Justified only if miss cost is high." },
              { ratio: ">50%",   hitrate: "80–82%",  note: "Flat region. Long tail can't be captured regardless of size." },
            ].map(row => (
              <div key={row.ratio} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 60, fontFamily: "monospace", color: C.accent, fontSize: 13, fontWeight: 700 }}>{row.ratio}</div>
                <div style={{ width: 70, fontFamily: "monospace", color: C.green, fontSize: 13 }}>{row.hitrate}</div>
                <div style={{ fontSize: 12, color: C.textDim, flex: 1 }}>{row.note}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ── ARCHITECTURE TAB ─────────────────────────────────────────
const ArchView = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* LRU internals diagram */}
      <Panel>
        <SectionHead title="LRU Internal Structure" sub="HashMap + Doubly Linked List" />
        <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ color: C.textDim, marginBottom: 8 }}>{"// HashMap: key → node*"}</div>
          <div style={{ background: "#ffffff06", borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <div style={{ color: C.amber }}>hashmap = {"{"}</div>
            {[["'cat'", "→ node3"], ["'dog'", "→ node1"], ["'fox'", "→ node2"]].map(([k, v]) => (
              <div key={k} style={{ marginLeft: 16, color: C.text }}>{k}: <span style={{ color: C.accent }}>{v}</span></div>
            ))}
            <div style={{ color: C.amber }}>{"}"}</div>
          </div>
          <div style={{ color: C.textDim, marginBottom: 8 }}>{"// Linked List: LRU ← → MRU"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 12 }}>
            {[
              { label: "HEAD", color: C.muted, note: "evict" },
              { label: "dog", color: C.red, note: "LRU" },
              { label: "fox", color: C.amber, note: "" },
              { label: "cat", color: C.green, note: "MRU" },
              { label: "TAIL", color: C.muted, note: "recent" },
            ].map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ border: `1px solid ${n.color}`, borderRadius: 6, padding: "4px 10px", color: n.color, fontSize: 12 }}>{n.label}</div>
                  {n.note && <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{n.note}</div>}
                </div>
                {i < 4 && <span style={{ color: C.border, margin: "0 2px", fontSize: 16 }}>⟷</span>}
              </div>
            ))}
          </div>
          <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6 }}>
            <div><span style={{ color: C.accent }}>get('cat')</span>: move cat to tail → O(1)</div>
            <div><span style={{ color: C.amber }}>put('eel')</span>: insert at tail, evict 'dog' (head) → O(1)</div>
          </div>
        </div>
      </Panel>

      {/* Sharding diagram */}
      <Panel>
        <SectionHead title="Sharded Architecture" sub="16 shards, each with independent RW-lock" />
        <div style={{ fontFamily: "monospace", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ border: `1px solid ${C.accent}`, borderRadius: 6, padding: "6px 14px", color: C.accent }}>key</div>
            <div style={{ color: C.textDim }}>→ hash(key) % N →</div>
            <div style={{ border: `1px solid ${C.amber}`, borderRadius: 6, padding: "6px 14px", color: C.amber }}>shard_id</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} style={{
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 4px",
                textAlign: "center", fontSize: 11,
                background: i < 3 ? `${C.accent}12` : "transparent",
              }}>
                <div style={{ color: i < 3 ? C.accent : C.textDim }}>S{i}</div>
                <div style={{ color: C.textDim, fontSize: 9 }}>RWLock</div>
              </div>
            ))}
          </div>
          <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.7 }}>
            <div>• <span style={{ color: C.green }}>Read</span>: shared lock — many concurrent readers per shard</div>
            <div>• <span style={{ color: C.red }}>Write</span>: exclusive lock — blocks only its own shard</div>
            <div>• <span style={{ color: C.amber }}>Benefit</span>: contention prob ≈ 1/{16} vs single lock</div>
            <div>• <span style={{ color: C.accent }}>Tradeoff</span>: capacity split across shards (slight LRU skew)</div>
          </div>
        </div>
      </Panel>
    </div>

    {/* Code snippet */}
    <Panel>
      <SectionHead title="Implementation Highlights" sub="Core patterns from lru_cache.py" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          {
            title: "O(1) LRU Promotion",
            color: C.accent,
            code: `def get(self, key):\n  entry = self._data.get(key)\n  if entry is None:\n    self.misses += 1\n    return False, None\n  if not entry.is_alive():  # TTL\n    del self._data[key]\n    return False, None\n  self._data.move_to_end(key)  # MRU\n  self.hits += 1\n  return True, entry.value`,
          },
          {
            title: "RW Lock (readers-writer)",
            color: C.amber,
            code: `class _ReadCtx:\n  def __enter__(self):\n    with self._l._read_ready:\n      self._l._readers += 1\n  def __exit__(self, *_):\n    with self._l._read_ready:\n      self._l._readers -= 1\n      if self._l._readers == 0:\n        self._l._read_ready\\\n          .notify_all()`,
          },
          {
            title: "Shard Routing",
            color: C.green,
            code: `def _shard(self, key) -> int:\n  h = int(hashlib.md5(\n    str(key).encode()\n  ).hexdigest(), 16)\n  return h % self.num_shards\n\ndef get(self, key):\n  idx  = self._shard(key)\n  lock = self._locks[idx]\n  with lock.read_lock():\n    return self._shards[idx]\\\n           .get(key)`,
          },
        ].map(s => (
          <div key={s.title}>
            <div style={{ fontSize: 12, color: s.color, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
            <pre style={{
              background: "#0A0E1A", border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "12px 14px", fontSize: 11, color: C.textDim,
              overflow: "auto", lineHeight: 1.6, margin: 0,
              borderLeft: `2px solid ${s.color}`,
            }}>{s.code}</pre>
          </div>
        ))}
      </div>
    </Panel>
  </div>
);

// ── ROOT APP ──────────────────────────────────────────────────
const TABS = [
  { id: "theory",    label: "Theory",        icon: "◈" },
  { id: "benchmark", label: "Benchmark",     icon: "⚡" },
  { id: "patterns",  label: "Access Patterns", icon: "≋" },
  { id: "capacity",  label: "Capacity Sweep", icon: "▲" },
  { id: "arch",      label: "Architecture",  icon: "⬡" },
];

export default function App() {
  const [tab, setTab] = useState("benchmark");

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", color: C.text,
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      padding: "28px 32px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", color: C.text }}>
            Concurrent LRU Cache
          </h1>
          <span style={{ fontSize: 13, color: C.accent, fontFamily: "monospace", background: `${C.accent}15`, padding: "2px 10px", borderRadius: 20 }}>
            Project 11 · Data Structures
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: C.textDim }}>
          Sharded LRU · RW Locks · TTL · Hit-Rate Simulator · Zipf Access Patterns
        </p>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: "transparent", border: "none", outline: "none",
            borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
            color: tab === t.id ? C.accent : C.textDim,
            transition: "all 0.15s",
            marginBottom: -1,
          }}>
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "theory"    && <TheoryView />}
      {tab === "benchmark" && <BenchmarkView />}
      {tab === "patterns"  && <PatternsView />}
      {tab === "capacity"  && <CapacityView />}
      {tab === "arch"      && <ArchView />}
    </div>
  );
}
