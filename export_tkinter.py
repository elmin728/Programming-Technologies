"""
Displays benchmark results using a Tkinter GUI.
Usage: python export_tkinter.py
"""

import json
import tkinter as tk
from tkinter import ttk
import tkinter.font as tkfont

# ── Load results ──────────────────────────────────────────────
with open("benchmark_results.json") as f:
    DATA = json.load(f)

# ── Color palette ─────────────────────────────────────────────
C = {
    "bg":      "#0A0E1A",
    "panel":   "#111827",
    "border":  "#1E2A3A",
    "accent":  "#00D4FF",
    "green":   "#00FF9F",
    "amber":   "#FFB830",
    "red":     "#FF4D6D",
    "purple":  "#A78BFA",
    "white":   "#E2E8F0",
    "muted":   "#718096",
    "navy":    "#1E2A3A",
}

ROW_COLORS = [C["red"], C["accent"], C["amber"], C["green"], C["purple"]]
PAT_COLORS = {
    "uniform":    C["red"],
    "zipf":       C["accent"],
    "zipf_hot":   C["green"],
    "sequential": C["amber"],
}


# ════════════════════════════════════════════════════════════
class LRUDashboard(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("⚡  Concurrent LRU Cache — Benchmark Dashboard")
        self.configure(bg=C["bg"])
        self.geometry("1100x780")
        self.resizable(True, True)
        self._build_ui()

    # ── Font helper ───────────────────────────────────────────
    def _font(self, size=11, bold=False, mono=False):
        family = "Consolas" if mono else "Segoe UI"
        weight = "bold" if bold else "normal"
        return tkfont.Font(family=family, size=size, weight=weight)

    # ── Main UI ───────────────────────────────────────────────
    def _build_ui(self):
        # Header
        hdr = tk.Frame(self, bg=C["bg"], pady=16, padx=28)
        hdr.pack(fill="x")

        tk.Label(hdr, text="Concurrent LRU Cache",
                 bg=C["bg"], fg=C["white"],
                 font=self._font(20, bold=True)).pack(side="left")
        tk.Label(hdr, text="  Benchmark Dashboard",
                 bg=C["bg"], fg=C["accent"],
                 font=self._font(20, bold=True)).pack(side="left")

        meta = DATA["meta"]
        info = (f"  {meta['num_clients']} clients  ·  "
                f"{meta['ops_per_client']} ops/client  ·  "
                f"Universe={meta['universe_size']}  ·  "
                f"Capacity={meta['cache_capacity']}  ·  Zipf α=1.2")
        tk.Label(hdr, text=info, bg=C["bg"], fg=C["muted"],
                 font=self._font(9)).pack(side="left", padx=10)

        # Tab bar
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=16, pady=(0, 16))

        style = ttk.Style()
        style.theme_use("default")
        style.configure("TNotebook",     background=C["bg"],    borderwidth=0)
        style.configure("TNotebook.Tab", background=C["panel"], foreground=C["muted"],
                        padding=[14, 6], font=("Segoe UI", 10))
        style.map("TNotebook.Tab",
                  background=[("selected", C["navy"])],
                  foreground=[("selected", C["accent"])])

        # Tab 1 — Benchmark
        tab1 = tk.Frame(nb, bg=C["bg"])
        nb.add(tab1, text="⚡  Benchmark")
        self._build_benchmark_tab(tab1)

        # Tab 2 — Patterns
        tab2 = tk.Frame(nb, bg=C["bg"])
        nb.add(tab2, text="≋  Access Patterns")
        self._build_patterns_tab(tab2)

        # Tab 3 — Capacity Sweep
        tab3 = tk.Frame(nb, bg=C["bg"])
        nb.add(tab3, text="▲  Capacity Sweep")
        self._build_capacity_tab(tab3)

    # ── Tab 1: Benchmark ──────────────────────────────────────
    def _build_benchmark_tab(self, parent):
        # KPI row
        kpi_frame = tk.Frame(parent, bg=C["bg"], pady=14, padx=16)
        kpi_frame.pack(fill="x")

        benchmarks = DATA["benchmarks"]
        no_cache   = benchmarks[0]
        best       = benchmarks[1]
        speedup    = best["throughput_ops_s"] / no_cache["throughput_ops_s"]
        saved      = (1 - best["db_fetches"] / no_cache["db_fetches"]) * 100

        kpis = [
            (f"{speedup:.1f}×",  "Throughput gain",         C["green"]),
            (f"{best.get('cache_hit_rate', 0)*100:.0f}%", "Hit Rate", C["accent"]),
            (f"{saved:.0f}%",    "DB queries saved",        C["amber"]),
            (f"{best['avg_latency_ms']:.2f} ms", "Avg latency", C["purple"]),
        ]
        for val, lbl, color in kpis:
            self._kpi_card(kpi_frame, val, lbl, color).pack(
                side="left", padx=8, ipadx=10, ipady=6)

        # Table
        self._section_label(parent, "Strategy comparison")
        cols = ("Strategy", "Hit Rate", "Avg ms", "p95 ms", "p99 ms", "ops/s", "DB Queries")
        tv   = self._make_treeview(parent, cols, heights=6)

        for i, r in enumerate(benchmarks):
            color = ROW_COLORS[i % len(ROW_COLORS)]
            tag   = f"row{i}"
            tv.insert("", "end", tags=(tag,), values=(
                r["label"],
                f"{r.get('cache_hit_rate', 0)*100:.1f}%",
                f"{r['avg_latency_ms']:.3f}",
                f"{r['p95_latency_ms']:.3f}",
                f"{r['p99_latency_ms']:.3f}",
                f"{r['throughput_ops_s']:,.0f}",
                f"{r.get('db_fetches', 0):,}",
            ))
            tv.tag_configure(tag, foreground=color)

        # Bar chart — throughput
        self._section_label(parent, "Throughput comparison (ops/s)")
        canvas_frame = tk.Frame(parent, bg=C["panel"],
                                highlightbackground=C["border"], highlightthickness=1)
        canvas_frame.pack(fill="x", padx=16, pady=(0, 16))

        cv = tk.Canvas(canvas_frame, bg=C["panel"], height=160, highlightthickness=0)
        cv.pack(fill="x", padx=12, pady=12)
        cv.update_idletasks()
        self._draw_bar_chart(cv, benchmarks)

    # ── Tab 2: Patterns ───────────────────────────────────────
    def _build_patterns_tab(self, parent):
        self._section_label(parent, "Access pattern comparison")
        cols = ("Pattern", "Hit Rate", "Avg ms", "p95 ms", "Throughput")
        tv   = self._make_treeview(parent, cols, heights=5)

        patterns = DATA["pattern_comparison"]
        for i, p in enumerate(patterns):
            color = PAT_COLORS.get(p["pattern"], C["white"])
            tag   = f"pat{i}"
            tv.insert("", "end", tags=(tag,), values=(
                p["pattern"],
                f"{p['hit_rate']*100:.1f}%",
                f"{p['avg_latency_ms']:.3f}",
                f"{p['p95_latency_ms']:.3f}",
                f"{p['throughput']:,.0f}",
            ))
            tv.tag_configure(tag, foreground=color)

        # Hit rate bar chart
        self._section_label(parent, "Hit rate chart")
        canvas_frame = tk.Frame(parent, bg=C["panel"],
                                highlightbackground=C["border"], highlightthickness=1)
        canvas_frame.pack(fill="x", padx=16, pady=(0, 16))
        cv = tk.Canvas(canvas_frame, bg=C["panel"], height=180, highlightthickness=0)
        cv.pack(fill="x", padx=12, pady=12)
        cv.update_idletasks()
        self._draw_pattern_bars(cv, patterns)

    # ── Tab 3: Capacity Sweep ─────────────────────────────────
    def _build_capacity_tab(self, parent):
        self._section_label(parent, "Hit Rate vs Cache Capacity — Zipf α=1.2")

        # Canvas chart
        canvas_frame = tk.Frame(parent, bg=C["panel"],
                                highlightbackground=C["border"], highlightthickness=1)
        canvas_frame.pack(fill="both", expand=True, padx=16, pady=(0, 12))
        cv = tk.Canvas(canvas_frame, bg=C["panel"], highlightthickness=0)
        cv.pack(fill="both", expand=True, padx=16, pady=16)
        cv.bind("<Configure>", lambda e: self._draw_line_chart(cv))
        self._cv_capacity = cv
        self._draw_line_chart(cv)

        # Summary table
        cols = ("Capacity", "Hit Rate %")
        tv = self._make_treeview(parent, cols, heights=5)
        for row in DATA["capacity_sweep"]:
            tv.insert("", "end", values=(
                row["capacity"],
                f"{row['hit_rate']*100:.1f}%",
            ))

    # ── Helper: KPI card ──────────────────────────────────────
    def _kpi_card(self, parent, val, label, color):
        f = tk.Frame(parent, bg=C["panel"],
                     highlightbackground=color, highlightthickness=1,
                     padx=16, pady=10)
        tk.Label(f, text=label, bg=C["panel"], fg=C["muted"],
                 font=self._font(9)).pack(anchor="w")
        tk.Label(f, text=val, bg=C["panel"], fg=color,
                 font=self._font(22, bold=True, mono=True)).pack(anchor="w")
        return f

    # ── Helper: Section label ─────────────────────────────────
    def _section_label(self, parent, text):
        tk.Label(parent, text=text.upper(),
                 bg=C["bg"], fg=C["muted"],
                 font=self._font(9)).pack(anchor="w", padx=20, pady=(14, 4))

    # ── Helper: Treeview ──────────────────────────────────────
    def _make_treeview(self, parent, cols, heights=8):
        style = ttk.Style()
        style.configure("Dark.Treeview",
                        background=C["panel"],
                        foreground=C["white"],
                        fieldbackground=C["panel"],
                        rowheight=28,
                        font=("Consolas", 10))
        style.configure("Dark.Treeview.Heading",
                        background=C["navy"],
                        foreground=C["muted"],
                        font=("Segoe UI", 9, "bold"),
                        relief="flat")
        style.map("Dark.Treeview",
                  background=[("selected", C["navy"])],
                  foreground=[("selected", C["accent"])])

        frame = tk.Frame(parent, bg=C["bg"])
        frame.pack(fill="x", padx=16, pady=(0, 8))

        tv = ttk.Treeview(frame, columns=cols, show="headings",
                          height=heights, style="Dark.Treeview")

        col_w = 900 // len(cols)
        for col in cols:
            tv.heading(col, text=col)
            tv.column(col, width=col_w,
                      anchor="center" if col != cols[0] else "w",
                      minwidth=60)

        sb = ttk.Scrollbar(frame, orient="vertical", command=tv.yview)
        tv.configure(yscrollcommand=sb.set)
        tv.pack(side="left", fill="x", expand=True)
        sb.pack(side="right", fill="y")
        return tv

    # ── Benchmark bar chart ───────────────────────────────────
    def _draw_bar_chart(self, cv, benchmarks):
        cv.update_idletasks()
        W = cv.winfo_width() or 900
        H = 140
        PAD_L, PAD_R, PAD_T, PAD_B = 60, 20, 10, 30
        inner_w = W - PAD_L - PAD_R
        inner_h = H - PAD_T - PAD_B

        max_val = max(r["throughput_ops_s"] for r in benchmarks)
        n     = len(benchmarks)
        gap   = inner_w / n
        bar_w = gap * 0.6

        for i, r in enumerate(benchmarks):
            color = ROW_COLORS[i % len(ROW_COLORS)]
            val   = r["throughput_ops_s"]
            bar_h = (val / max_val) * inner_h
            x1    = PAD_L + i * gap + gap * 0.2
            x2    = x1 + bar_w
            y1    = PAD_T + inner_h - bar_h
            y2    = PAD_T + inner_h

            cv.create_rectangle(x1, y1, x2, y2, fill=color, outline="", width=0)
            cv.create_text((x1+x2)/2, y1-4,
                           text=f"{val:,.0f}",
                           fill=color, font=("Consolas", 8), anchor="s")
            cv.create_text((x1+x2)/2, H-4,
                           text=r["label"],
                           fill=C["muted"], font=("Segoe UI", 8), anchor="s")

        # X axis line
        cv.create_line(PAD_L, PAD_T+inner_h, W-PAD_R, PAD_T+inner_h,
                       fill=C["border"], width=1)

    # ── Pattern bar chart ─────────────────────────────────────
    def _draw_pattern_bars(self, cv, patterns):
        cv.update_idletasks()
        W = cv.winfo_width() or 900
        H = 160
        PAD_L, PAD_R, PAD_T, PAD_B = 60, 20, 16, 30
        inner_w = W - PAD_L - PAD_R
        inner_h = H - PAD_T - PAD_B

        n   = len(patterns)
        gap = inner_w / n

        for i, p in enumerate(patterns):
            color = PAT_COLORS.get(p["pattern"], C["white"])
            val   = p["hit_rate"]
            bar_h = val * inner_h
            x1    = PAD_L + i * gap + gap * 0.15
            x2    = x1 + gap * 0.7
            y1    = PAD_T + inner_h - bar_h
            y2    = PAD_T + inner_h

            cv.create_rectangle(x1, y1, x2, y2, fill=color, outline="", width=0)
            cv.create_text((x1+x2)/2, y1-4,
                           text=f"{val*100:.1f}%",
                           fill=color, font=("Consolas", 9, "bold"), anchor="s")
            cv.create_text((x1+x2)/2, H-4,
                           text=p["pattern"],
                           fill=C["muted"], font=("Segoe UI", 8), anchor="s")

        # X axis line
        cv.create_line(PAD_L, PAD_T+inner_h, W-PAD_R, PAD_T+inner_h,
                       fill=C["border"], width=1)

    # ── Capacity line chart ───────────────────────────────────
    def _draw_line_chart(self, cv):
        cv.delete("all")
        cv.update_idletasks()
        W = cv.winfo_width()  or 800
        H = cv.winfo_height() or 320
        if W < 100 or H < 100:
            return

        PAD     = 50
        inner_w = W - PAD * 2
        inner_h = H - PAD * 2

        data = DATA["capacity_sweep"]
        vals = [d["hit_rate"] for d in data]
        n    = len(data)

        def pt(i, v):
            x = PAD + (i / (n - 1)) * inner_w
            y = PAD + (1 - v) * inner_h
            return x, y

        # Grid lines
        for pct in [0.2, 0.4, 0.6, 0.8]:
            _, y = pt(0, pct)
            cv.create_line(PAD, y, W-PAD, y, fill=C["border"], dash=(4, 4))
            cv.create_text(PAD-6, y, text=f"{int(pct*100)}%",
                           fill=C["muted"], font=("Consolas", 8), anchor="e")

        # 80% reference line
        _, ref_y = pt(0, 0.8)
        cv.create_line(PAD, ref_y, W-PAD, ref_y,
                       fill=C["amber"], dash=(6, 4), width=1.5)
        cv.create_text(W-PAD+4, ref_y, text="80%",
                       fill=C["amber"], font=("Consolas", 8), anchor="w")

        # Curve
        points = [pt(i, v) for i, v in enumerate(vals)]
        for i in range(len(points)-1):
            x1, y1 = points[i]
            x2, y2 = points[i+1]
            cv.create_line(x1, y1, x2, y2,
                           fill=C["accent"], width=2.5, smooth=True)

        # Dots + x-axis labels
        for i, ((x, y), d) in enumerate(zip(points, data)):
            cv.create_oval(x-5, y-5, x+5, y+5,
                           fill=C["accent"], outline=C["bg"], width=2)
            cv.create_text(x, H-PAD+14,
                           text=str(d["capacity"]),
                           fill=C["muted"], font=("Consolas", 8), anchor="n")

        # Axis lines
        cv.create_line(PAD, PAD, PAD, H-PAD, fill=C["border"], width=1)
        cv.create_line(PAD, H-PAD, W-PAD, H-PAD, fill=C["border"], width=1)
        cv.create_text(W//2, H-8,
                       text="Cache Capacity (entries)",
                       fill=C["muted"], font=("Segoe UI", 9))
        cv.create_text(12, H//2,
                       text="Hit Rate", fill=C["muted"],
                       font=("Segoe UI", 9), angle=90)


# ════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app = LRUDashboard()
    app.mainloop()
