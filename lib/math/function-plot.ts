/**
 * Parse assistant text for y = f(x) / f(x) = … and build Chart.js config for QuickChart.io.
 */

const QUICKCHART_ENDPOINT = "https://quickchart.io/chart";

/** Unwrap $...$, $$...$$, \\(...\\), \\[...\\] so y=/f(x)= patterns match chat math. */
function unwrapMarkdownAndLatexMath(source: string): string {
  let t = source.replace(/\r/g, "\n");
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, "\n$1\n");
  t = t.replace(/\$([^$\n]+)\$/g, "\n$1\n");
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, "\n$1\n");
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, "\n$1\n");
  return t;
}

export function extractPlottableRhs(latestAssistantMessage?: string): string | null {
  if (!latestAssistantMessage?.trim()) return null;
  const text = unwrapMarkdownAndLatexMath(latestAssistantMessage);
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  const reF = /f\s*\(\s*x\s*\)\s*=\s*([^\n]+)/gi;
  while ((m = reF.exec(text)) !== null) blocks.push(m[1].trim());
  const reY = /(?:^|\n)\s*y\s*=\s*([^\n]+)/gi;
  while ((m = reY.exec(text)) !== null) blocks.push(m[1].trim());
  if (!blocks.length) return null;
  return blocks[blocks.length - 1] ?? null;
}

export function rhsToJsExpression(rhs: string): string | null {
  let e = rhs.trim();
  if (!e || e.length > 240) return null;
  if (
    /;|`|\[|]|=>|\\u[0-9a-f]{4}|import\b|eval\b|Function\b|window\b|document\b|__proto__|constructor\b|fetch\b|process\b|globalThis\b/i.test(
      e
    )
  ) {
    return null;
  }
  e = e.replace(/\$\$?/g, "");
  e = e.replace(/\\\(|\\\)|\\\[|\\\]/g, "");
  e = e.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "(($1)/($2))");
  e = e.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  e = e.replace(/\\cdot|\\times/gi, "*");
  e = e.replace(/\\div/gi, "/");
  e = e.replace(/\s+/g, "");
  e = e.replace(/\\[a-zA-Z]{2,}/g, "");
  e = e.replace(/\^/g, "**");
  e = e.replace(/√\(([^)]+)\)/g, "sqrt($1)");
  e = e.replace(/\b(sin|cos|tan)\(/gi, "Math.$1(");
  e = e.replace(/\b(sqrt|abs|log|exp)\(/gi, "Math.$1(");
  e = e.replace(/\b(pi|π)\b/gi, "Math.PI");
  e = e.replace(/\bE\b/g, "Math.E");
  e = e.replace(/(\d)\(/g, "$1*(");
  e = e.replace(/\)(\d)/g, ")*$1");
  e = e.replace(/(\d)x/gi, "$1*x");
  e = e.replace(/x(\d)/gi, "x*$1");
  e = e.replace(/\)\(/g, ")*(");
  e = e.replace(/\)(x)/gi, ")*$1");
  e = e.replace(/xMath\./gi, "x*Math.");
  if (!/^[0-9+\-*/().xMathsincotaqrulgpIE]+$/i.test(e)) {
    return null;
  }
  return e;
}

function tryCompilePlotFn(jsBody: string): ((x: number) => number) | null {
  try {
    const fn = new Function("x", `"use strict"; return (${jsBody});`) as (
      x: number
    ) => number;
    const t = [0, 0.5, 1, -1];
    let any = false;
    for (const xv of t) {
      const yv = Number(fn(xv));
      if (Number.isFinite(yv)) any = true;
    }
    if (!any) return null;
    return fn;
  } catch {
    return null;
  }
}

function sampleFunctionSeries(fn: (x: number) => number): {
  xs: number[];
  ys: (number | null)[];
} {
  const minX = -6;
  const maxX = 6;
  const steps = 240;
  const xs: number[] = [];
  const ys: (number | null)[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = minX + ((maxX - minX) * i) / steps;
    const y = Number(fn(x));
    xs.push(x);
    ys.push(Number.isFinite(y) && Math.abs(y) < 1e6 ? y : null);
  }
  return { xs, ys };
}

function buildChartConfig(
  xs: number[],
  ys: (number | null)[],
  rhs: string
): FunctionPlotChartConfig {
  const title = `y = ${rhs.length > 72 ? `${rhs.slice(0, 69)}…` : rhs}`;
  return {
    type: "line",
    data: {
      labels: xs.map((x) => x.toFixed(2)),
      datasets: [
        {
          label: "y",
          data: ys,
          fill: false,
          borderColor: "rgb(79, 70, 229)",
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false,
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 14,
      },
      legend: { display: false },
      scales: {
        xAxes: [
          {
            scaleLabel: { display: true, labelString: "x" },
          },
        ],
        yAxes: [
          {
            scaleLabel: { display: true, labelString: "y" },
          },
        ],
      },
    },
  };
}

export type FunctionPlotChartConfig = Record<string, unknown>;

export type FunctionPlotBuildResult =
  | { ok: true; rhs: string; chart: FunctionPlotChartConfig }
  | { ok: false; reason: "no_expression" }
  | { ok: false; reason: "parse_error"; rhs: string }
  | { ok: false; reason: "no_data"; rhs: string };

export function buildFunctionPlotChart(assistantMessage: string): FunctionPlotBuildResult {
  const rhs = extractPlottableRhs(assistantMessage);
  if (!rhs) return { ok: false, reason: "no_expression" };
  const js = rhsToJsExpression(rhs);
  if (!js) return { ok: false, reason: "parse_error", rhs };
  const fn = tryCompilePlotFn(js);
  if (!fn) return { ok: false, reason: "parse_error", rhs };
  const { xs, ys } = sampleFunctionSeries(fn);
  if (!ys.some((y) => y !== null)) return { ok: false, reason: "no_data", rhs };
  return { ok: true, rhs, chart: buildChartConfig(xs, ys, rhs) };
}

/** Renders chart PNG via QuickChart.io (POST). */
export async function fetchFunctionPlotPngFromQuickChart(
  chart: FunctionPlotChartConfig,
  options?: { width?: number; height?: number }
): Promise<Buffer> {
  const width = options?.width ?? 520;
  const height = options?.height ?? 300;
  const res = await fetch(QUICKCHART_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart,
      width,
      height,
      backgroundColor: "white",
      format: "png",
      devicePixelRatio: 2,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      errText?.slice(0, 200) || `QuickChart request failed (${res.status})`
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
