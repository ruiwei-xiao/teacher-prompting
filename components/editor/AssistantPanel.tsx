"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type VisualizationState =
  | {
      mode: "code-tracing";
      data: {
        code: string;
        activeStep: number;
        totalSteps: number;
        currentStatement: string;
        currentState: Record<string, string>;
        output: string[];
      };
    }
  | {
      mode: "virtual-lab";
      data: {
        equation: string;
        title: string;
        effectType: "gas" | "neutralization" | "precipitate" | "general";
        reactants: { label: string; amount: number }[];
        additions: { reagent: string; amount: number }[];
        reactionProgress: number;
        visibleOutcome: string;
        expectedProducts: string[];
      };
    };

function Icon({
  d,
  className = "w-4 h-4",
}: {
  d: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function getAssistantSystemPrompt() {
  if (typeof window !== "undefined") {
    const fromEditor = localStorage.getItem("instruction-doc-md") || "";
    if (fromEditor.trim()) return fromEditor;
  }

  return `I’m a python beginner having trouble with debugging.
The coding problem, my code, and output are as follows:[problem description]
[current code]
[current output]

Can you act as an intro-level programming tutor and generate a minimal-code example of a different problem that uses a for loop to iterate over indices?

Don’t give me the solution to the problem.`;
}

export function detectVisualizationMode(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes("code tracing coach") ||
    normalized.includes("visual trace") ||
    normalized.includes("trace table")
  ) {
    return "code-tracing" as const;
  }

  if (
    normalized.includes("virtual lab coach") ||
    normalized.includes("visual lab") ||
    normalized.includes("reaction state panel")
  ) {
    return "virtual-lab" as const;
  }

  return null;
}

type TraceRuntimeValue = number | string | Array<number | string>;

type TraceSourceLine = {
  indent: number;
  lineNumber: number;
  text: string;
};

type TraceStep = {
  id: string;
  sourceLine: number;
  statement: string;
  explanation: string;
  state: Record<string, string>;
  output: string[];
};

const DEFAULT_TRACE_CODE = `items = [2, 4, 6]
total = 0
for i in range(len(items)):
  total += items[i]
print(total)`;

const TRACE_EXAMPLES: Record<string, string> = {
  "Sum a list": DEFAULT_TRACE_CODE,
  "Track max value": `nums = [3, 5, 7]
best = 0
for i in range(len(nums)):
  best += nums[i]
print(best)`,
  "JavaScript loop": `const scores = [4, 6, 8];
let total = 0;
for (let i = 0; i < scores.length; i++) {
  total += scores[i];
}
console.log(total);`,
};

function formatRuntimeValue(value: TraceRuntimeValue) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => String(item)).join(", ")}]`;
  }

  return String(value);
}

function extractStudentCode(message?: string) {
  if (!message?.trim()) return null;

  const codeFence = message.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (codeFence?.[1]?.trim()) return codeFence[1].trim();

  const looksLikeCode =
    message.includes("\n") ||
    /(for\s+.+range|for\s*\(.+\)|print\(|console\.log|let\s+\w+\s*=|const\s+\w+\s*=)/i.test(
      message
    );

  return looksLikeCode ? message.trim() : null;
}

function parseArrayLiteral(source: string) {
  const trimmed = source.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];

  return body.split(",").map((token) => {
    const part = token.trim();
    if (/^-?\d+(\.\d+)?$/.test(part)) {
      return Number(part);
    }

    return part.replace(/^["']|["']$/g, "");
  });
}

function resolveRuntimeValue(
  expression: string,
  state: Record<string, TraceRuntimeValue>
): TraceRuntimeValue {
  const trimmed = expression.trim().replace(/;$/, "");

  const arrayLiteral = parseArrayLiteral(trimmed);
  if (arrayLiteral) return arrayLiteral;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (/^["'].+["']$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }

  const lenMatch = trimmed.match(/^len\(([\w$]+)\)$/);
  if (lenMatch) {
    const target = state[lenMatch[1]];
    if (Array.isArray(target) || typeof target === "string") {
      return target.length;
    }
  }

  const lengthMatch = trimmed.match(/^([\w$]+)\.length$/);
  if (lengthMatch) {
    const target = state[lengthMatch[1]];
    if (Array.isArray(target) || typeof target === "string") {
      return target.length;
    }
  }

  const indexMatch = trimmed.match(/^([\w$]+)\[(.+)\]$/);
  if (indexMatch) {
    const collection = state[indexMatch[1]];
    const indexValue = resolveRuntimeValue(indexMatch[2], state);
    const index =
      typeof indexValue === "number" ? indexValue : Number(indexValue);

    if (Array.isArray(collection) && Number.isInteger(index)) {
      return collection[index];
    }
  }

  const plusParts = trimmed.split(/\s*\+\s*/);
  if (plusParts.length > 1) {
    const values = plusParts.map((part) => resolveRuntimeValue(part, state));
    if (values.every((value) => typeof value === "number")) {
      return values.reduce((sum, value) => sum + Number(value), 0);
    }

    return values.map((value) => formatRuntimeValue(value)).join("");
  }

  if (trimmed in state) {
    return state[trimmed];
  }

  throw new Error(`Unsupported expression: ${trimmed}`);
}

function createTraceStep(args: {
  sourceLine: number;
  statement: string;
  explanation: string;
  state: Record<string, TraceRuntimeValue>;
  output: string[];
  index: number;
}) {
  return {
    id: `${args.sourceLine}-${args.index}`,
    sourceLine: args.sourceLine,
    statement: args.statement,
    explanation: args.explanation,
    state: Object.fromEntries(
      Object.entries(args.state).map(([key, value]) => [key, formatRuntimeValue(value)])
    ),
    output: [...args.output],
  };
}

function collectPythonLoopBody(lines: TraceSourceLine[], startIndex: number) {
  const body: TraceSourceLine[] = [];
  const loopIndent = lines[startIndex].indent;
  let cursor = startIndex + 1;

  while (cursor < lines.length && lines[cursor].indent > loopIndent) {
    body.push(lines[cursor]);
    cursor += 1;
  }

  return { body, nextIndex: cursor - 1 };
}

function collectJavaScriptLoopBody(lines: TraceSourceLine[], startIndex: number) {
  const body: TraceSourceLine[] = [];
  let depth = lines[startIndex].text.includes("{") ? 1 : 0;
  let cursor = startIndex + 1;

  while (cursor < lines.length) {
    const current = lines[cursor];
    const opens = (current.text.match(/\{/g) || []).length;
    const closes = (current.text.match(/\}/g) || []).length;

    if (current.text !== "}") {
      body.push(current);
    }

    depth += opens;
    depth -= closes;

    if (depth <= 0) {
      break;
    }

    cursor += 1;
  }

  return { body, nextIndex: cursor };
}

function runTraceStatement(args: {
  line: TraceSourceLine;
  state: Record<string, TraceRuntimeValue>;
  output: string[];
  steps: TraceStep[];
}) {
  const { line, state, output, steps } = args;
  const assignmentMatch = line.text.match(
    /^(?:let |const |var )?([A-Za-z_$][\w$]*)\s*=\s*(.+)$/
  );

  if (assignmentMatch) {
    state[assignmentMatch[1]] = resolveRuntimeValue(assignmentMatch[2], state);
    steps.push(
      createTraceStep({
        sourceLine: line.lineNumber,
        statement: line.text,
        explanation: `Update ${assignmentMatch[1]} after evaluating the right-hand side.`,
        state,
        output,
        index: steps.length,
      })
    );
    return;
  }

  const incrementMatch = line.text.match(/^([A-Za-z_$][\w$]*)\s*\+=\s*(.+)$/);
  if (incrementMatch) {
    const currentValue = state[incrementMatch[1]];
    const deltaValue = resolveRuntimeValue(incrementMatch[2], state);

    if (typeof currentValue === "number" && typeof deltaValue === "number") {
      state[incrementMatch[1]] = currentValue + deltaValue;
    } else {
      state[incrementMatch[1]] =
        formatRuntimeValue(currentValue) + formatRuntimeValue(deltaValue);
    }

    steps.push(
      createTraceStep({
        sourceLine: line.lineNumber,
        statement: line.text,
        explanation: `Apply the accumulated change to ${incrementMatch[1]}.`,
        state,
        output,
        index: steps.length,
      })
    );
    return;
  }

  const printMatch = line.text.match(/^(?:print|console\.log)\((.+)\)$/);
  if (printMatch) {
    output.push(formatRuntimeValue(resolveRuntimeValue(printMatch[1], state)));
    steps.push(
      createTraceStep({
        sourceLine: line.lineNumber,
        statement: line.text,
        explanation: "Send the current value to output.",
        state,
        output,
        index: steps.length,
      })
    );
    return;
  }

  if (line.text === "{" || line.text === "}") {
    return;
  }

  throw new Error(`Unsupported tracing statement on line ${line.lineNumber}.`);
}

function buildTraceFromCode(code: string) {
  const lines = code
    .replace(/\r/g, "")
    .split("\n")
    .map((raw, index) => ({
      indent: raw.match(/^\s*/)?.[0].length ?? 0,
      lineNumber: index + 1,
      text: raw.trim().replace(/;$/, ""),
    }))
    .filter(
      (line) =>
        line.text &&
        !line.text.startsWith("#") &&
        !line.text.startsWith("//")
    );

  if (!lines.length) {
    return { steps: [] as TraceStep[], error: "Add a short code snippet to trace." };
  }

  const state: Record<string, TraceRuntimeValue> = {};
  const output: string[] = [];
  const steps: TraceStep[] = [];

  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const pythonLoop = line.text.match(
        /^for\s+([A-Za-z_$][\w$]*)\s+in\s+range\((.+)\):$/
      );
      const jsLoop = line.text.match(
        /^for\s*\(\s*(?:let|const|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;\s*\1\s*<\s*(.+?)\s*;\s*\1\+\+\s*\)\s*\{?$/
      );

      if (pythonLoop || jsLoop) {
        const loopVar = (pythonLoop || jsLoop)?.[1] || "i";
        const startValue = jsLoop
          ? resolveRuntimeValue(jsLoop[2], state)
          : 0;
        const endValue = resolveRuntimeValue(
          pythonLoop ? pythonLoop[2] : jsLoop?.[3] || "0",
          state
        );

        if (typeof startValue !== "number" || typeof endValue !== "number") {
          throw new Error(`Loop bounds on line ${line.lineNumber} must resolve to numbers.`);
        }

        const { body, nextIndex } = pythonLoop
          ? collectPythonLoopBody(lines, index)
          : collectJavaScriptLoopBody(lines, index);

        if (!body.length) {
          throw new Error(`Add at least one loop body line under line ${line.lineNumber}.`);
        }

        for (let value = startValue; value < endValue; value += 1) {
          state[loopVar] = value;
          steps.push(
            createTraceStep({
              sourceLine: line.lineNumber,
              statement: `${loopVar} = ${value}`,
              explanation: `Start loop iteration ${value + 1}.`,
              state,
              output,
              index: steps.length,
            })
          );

          body.forEach((bodyLine) =>
            runTraceStatement({
              line: bodyLine,
              state,
              output,
              steps,
            })
          );
        }

        index = nextIndex;
        continue;
      }

      runTraceStatement({
        line,
        state,
        output,
        steps,
      });
    }

    if (!steps.length) {
      return {
        steps: [] as TraceStep[],
        error: "This snippet did not produce any traceable steps.",
      };
    }

    return { steps };
  } catch (error) {
    return {
      steps: [] as TraceStep[],
      error:
        error instanceof Error
          ? error.message
          : "Could not trace this snippet yet. Try a short loop with variables and print statements.",
    };
  }
}

function TraceVisualization({
  latestUserMessage,
  onStateChange,
}: {
  latestUserMessage?: string;
  onStateChange?: (state: VisualizationState) => void;
}) {
  const latestMessageCode = extractStudentCode(latestUserMessage);
  const initialCode = latestMessageCode || TRACE_EXAMPLES["Sum a list"];
  const initialTrace = buildTraceFromCode(initialCode);
  const [selectedExample, setSelectedExample] = useState("Sum a list");
  const [traceCode, setTraceCode] = useState(initialCode);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>(initialTrace.steps);
  const [traceError, setTraceError] = useState(initialTrace.error || "");
  const [activeStep, setActiveStep] = useState(0);

  const currentStep = traceSteps[activeStep];

  useEffect(() => {
    onStateChange?.({
      mode: "code-tracing",
      data: {
        code: traceCode,
        activeStep,
        totalSteps: traceSteps.length,
        currentStatement: currentStep?.statement || "",
        currentState: currentStep?.state || {},
        output: currentStep?.output || [],
      },
    });
  }, [activeStep, currentStep, onStateChange, traceCode, traceSteps]);

  function rebuildTrace(nextCode: string) {
    const result = buildTraceFromCode(nextCode);
    setTraceSteps(result.steps);
    setTraceError(result.error || "");
    setActiveStep(0);
  }

  function loadExample(name: string) {
    const nextCode = TRACE_EXAMPLES[name];
    setSelectedExample(name);
    setTraceCode(nextCode);
    rebuildTrace(nextCode);
  }

  function jumpToLine(lineNumber: number) {
    const firstStep = traceSteps.findIndex((step) => step.sourceLine === lineNumber);
    if (firstStep >= 0) {
      setActiveStep(firstStep);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-sky-700">
              Interactive code tracing
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Ask the student what code they want to trace, then step through it in
              the interface.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedExample}
              onChange={(event) => loadExample(event.target.value)}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {Object.keys(TRACE_EXAMPLES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => rebuildTrace(traceCode)}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Build trace
            </button>
          </div>
        </div>
        {latestMessageCode && (
          <button
            type="button"
            onClick={() => {
              setTraceCode(latestMessageCode);
              rebuildTrace(latestMessageCode);
            }}
            className="mt-3 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            Use latest student message as trace input
          </button>
        )}
        <textarea
          value={traceCode}
          onChange={(event) => setTraceCode(event.target.value)}
          className="mt-3 min-h-36 w-full rounded-2xl border border-sky-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-sky-400"
          placeholder="Paste a short Python or JavaScript loop here."
        />
        <div className="mt-2 text-xs text-slate-500">
          Best for small snippets with assignments, `for` loops, indexing, and
          `print` or `console.log`.
        </div>
      </div>

      {traceError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {traceError}
        </div>
      ) : null}

      {traceSteps.length > 0 && currentStep ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Step-through code view
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Click a line to jump to the first event on that line.
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Step {activeStep + 1} / {traceSteps.length}
                </div>
              </div>
              <div className="mt-3 space-y-1 rounded-2xl bg-slate-950 p-3">
                {traceCode.split("\n").map((line, index) => {
                  const lineNumber = index + 1;
                  const highlighted = currentStep.sourceLine === lineNumber;
                  const clickable = traceSteps.some(
                    (step) => step.sourceLine === lineNumber
                  );

                  return (
                    <button
                      key={`${lineNumber}-${line}`}
                      type="button"
                      onClick={() => jumpToLine(lineNumber)}
                      disabled={!clickable}
                      className={[
                        "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left font-mono text-xs",
                        highlighted
                          ? "bg-sky-500/20 text-sky-100"
                          : "text-slate-300",
                        clickable ? "hover:bg-white/5" : "cursor-default opacity-60",
                      ].join(" ")}
                    >
                      <span className="w-6 shrink-0 text-slate-500">{lineNumber}</span>
                      <span className="whitespace-pre-wrap">{line || " "}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Trace controls
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
                      disabled={activeStep === 0}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveStep((step) =>
                          Math.min(traceSteps.length - 1, step + 1)
                        )
                      }
                      disabled={activeStep === traceSteps.length - 1}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-sky-700">
                    Current statement
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate-800">
                    {currentStep.statement}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {currentStep.explanation}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Runtime state
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {Object.entries(currentStep.state).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {key}
                      </div>
                      <div className="mt-1 font-mono text-sm text-slate-800">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Output
                </div>
                <div className="mt-3 rounded-2xl bg-slate-950 p-3 font-mono text-xs text-emerald-300">
                  {currentStep.output.length
                    ? currentStep.output.join("\n")
                    : "No output yet."}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Execution timeline
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {traceSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs",
                    index === activeStep
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {index + 1}. L{step.sourceLine}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

type LabEffectType = "gas" | "neutralization" | "precipitate" | "general";

type LabReagent = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  note: string;
};

type LabProfile = {
  equation: string;
  title: string;
  summary: string;
  reagents: LabReagent[];
  apparatus: string[];
  effectType: LabEffectType;
  expectedProducts: string[];
  teacherPrompt: string;
};

function normalizeEquation(equation: string) {
  return equation.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitEquationSides(equation: string) {
  const [leftRaw = "", rightRaw = ""] = equation
    .replace(/=>/g, "->")
    .replace(/=/g, "->")
    .split("->");

  const left = leftRaw
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);
  const right = rightRaw
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);

  return { left, right };
}

function formatChemicalLabel(species: string) {
  const KNOWN_LABELS: Record<string, string> = {
    CH3COOH: "Vinegar (CH3COOH)",
    NaHCO3: "Baking Soda (NaHCO3)",
    HCl: "Hydrochloric Acid (HCl)",
    NaOH: "Sodium Hydroxide (NaOH)",
    AgNO3: "Silver Nitrate (AgNO3)",
    NaCl: "Sodium Chloride (NaCl)",
    AgCl: "Silver Chloride (AgCl)",
    H2O: "Water (H2O)",
    CO2: "Carbon Dioxide (CO2)",
    CH3COONa: "Sodium Acetate (CH3COONa)",
  };

  return KNOWN_LABELS[species] || species;
}

function getReagentNote(effectType: LabEffectType, species: string) {
  if (effectType === "gas") {
    return species.includes("HCO3") || species.includes("CO3")
      ? "Produces gas when combined with an acid."
      : "Supports a visible gas-forming reaction.";
  }

  if (effectType === "neutralization") {
    return species.startsWith("H")
      ? "Acts as the acid reactant in the neutralization."
      : "Acts as the base reactant in the neutralization.";
  }

  if (effectType === "precipitate") {
    return "Combines with another dissolved substance to form a visible solid.";
  }

  return "Auto-generated from the reaction equation.";
}

function inferReactionProfile(equation: string): LabProfile {
  const { left, right } = splitEquationSides(equation);
  const normalized = normalizeEquation(equation);
  const containsAcid = /(hcl|hno3|h2so4|ch3cooh)/.test(normalized);
  const containsBase = /(naoh|koh|nh4oh|nahco3|co3)/.test(normalized);
  const containsCo2 = /(^|[^a-z])co2([^a-z]|$)/.test(normalized);
  const containsPrecipitateProduct = /(agcl|baso4|caco3|pbi2)/.test(normalized);

  let effectType: LabEffectType = "general";
  if (containsCo2 || /(hco3|co3)/.test(normalized)) {
    effectType = "gas";
  } else if (containsPrecipitateProduct) {
    effectType = "precipitate";
  } else if (containsAcid && containsBase) {
    effectType = "neutralization";
  }

  const colorPalette = ["#bfdbfe", "#fde68a", "#d1fae5", "#fecaca", "#c4b5fd"];
  const reagents = left.map((species, index) => ({
    id: `equation-${index}`,
    label: formatChemicalLabel(species),
    shortLabel: species.replace(/\s+/g, ""),
    color: colorPalette[index % colorPalette.length],
    note: getReagentNote(effectType, species),
  }));

  const expectedProducts = right.length
    ? right.map((species) => formatChemicalLabel(species))
    : ["Observe the generated reaction products"];

  if (effectType === "gas") {
    return {
      equation,
      title: "Gas-forming reaction lab",
      summary: "This equation suggests a reaction that releases a visible gas.",
      reagents,
      apparatus: ["Beaker", "Dropper", "Gas bubbles view"],
      effectType,
      expectedProducts,
      teacherPrompt:
        "Ask the student which reactants must collide to make the bubbles appear and what evidence shows gas production.",
    };
  }

  if (effectType === "neutralization") {
    return {
      equation,
      title: "Neutralization lab",
      summary: "This equation suggests an acid-base reaction that trends toward neutral products.",
      reagents,
      apparatus: ["Beaker", "Thermometer", "Indicator color panel"],
      effectType,
      expectedProducts,
      teacherPrompt:
        "Ask the student how they would tell when the acid and base amounts are closest to balanced.",
    };
  }

  if (effectType === "precipitate") {
    return {
      equation,
      title: "Precipitation lab",
      summary: "This equation suggests a visible solid forms from dissolved reactants.",
      reagents,
      apparatus: ["Beaker", "Dropper", "Precipitate view panel"],
      effectType,
      expectedProducts,
      teacherPrompt:
        "Ask the student why a solid can appear even if both starting solutions look clear.",
    };
  }

  return {
    equation,
    title: "Equation-driven virtual lab",
    summary: "This lab was generated from the reaction equation with a general reaction scaffold.",
    reagents,
    apparatus: ["Beaker", "Dropper", "Observation panel"],
    effectType,
    expectedProducts,
    teacherPrompt:
      "Ask the student what visible evidence they would expect if this reaction is really happening.",
  };
}

function VirtualLabVisualization({
  onStateChange,
}: {
  onStateChange?: (state: VisualizationState) => void;
}) {
  const REACTION_PRESETS = [
    {
      equation: "CH3COOH + NaHCO3 -> CO2 + H2O + CH3COONa",
      title: "Acid-base gas formation",
      summary: "Vinegar reacts with baking soda and releases carbon dioxide bubbles.",
      reagents: [
        {
          id: "ch3cooh",
          label: "Vinegar (CH3COOH)",
          shortLabel: "Acid",
          color: "#fde68a",
          note: "Weak acid used in a classic fizzing reaction.",
        },
        {
          id: "nahco3",
          label: "Baking Soda (NaHCO3)",
          shortLabel: "Base",
          color: "#e5e7eb",
          note: "Mild base that produces gas when mixed with vinegar.",
        },
        {
          id: "indicator",
          label: "Indicator",
          shortLabel: "pH",
          color: "#c4b5fd",
          note: "Optional color cue for noticing acidity changes.",
        },
      ],
      apparatus: ["Beaker", "Measuring dropper", "Gas bubbles view"],
      effectType: "gas" as const,
      expectedProducts: ["CO2 gas", "Water", "Sodium acetate solution"],
      teacherPrompt:
        "Ask the student which reactant is limiting and whether adding more acid or more base would make the fizz last longer.",
    },
    {
      equation: "HCl + NaOH -> NaCl + H2O",
      title: "Neutralization",
      summary: "An acid and a base react to make salt and water, with a small temperature rise.",
      reagents: [
        {
          id: "hcl",
          label: "Hydrochloric Acid (HCl)",
          shortLabel: "Acid",
          color: "#fecaca",
          note: "Virtual dilute acid used for a safe neutralization simulation.",
        },
        {
          id: "naoh",
          label: "Sodium Hydroxide (NaOH)",
          shortLabel: "Base",
          color: "#bfdbfe",
          note: "Virtual dilute base used for a safe neutralization simulation.",
        },
        {
          id: "indicator",
          label: "Indicator",
          shortLabel: "pH",
          color: "#c4b5fd",
          note: "Shows whether the mixture is acidic, basic, or neutral.",
        },
      ],
      apparatus: ["Beaker", "Thermometer", "Indicator color panel"],
      effectType: "neutralization" as const,
      expectedProducts: ["Salt solution", "Water"],
      teacherPrompt:
        "Ask the student when the indicator should look most neutral and why matching amounts matters.",
    },
    {
      equation: "AgNO3 + NaCl -> AgCl + NaNO3",
      title: "Precipitation reaction",
      summary: "Two clear solutions react to form a cloudy white precipitate.",
      reagents: [
        {
          id: "agno3",
          label: "Silver Nitrate (AgNO3)",
          shortLabel: "AgNO3",
          color: "#e0f2fe",
          note: "Virtual solution used to form a visible precipitate.",
        },
        {
          id: "nacl",
          label: "Sodium Chloride (NaCl)",
          shortLabel: "NaCl",
          color: "#d1fae5",
          note: "Virtual salt solution that forms solid silver chloride.",
        },
        {
          id: "water",
          label: "Water",
          shortLabel: "H2O",
          color: "#bfdbfe",
          note: "Can dilute the mixture and reduce cloudiness.",
        },
      ],
      apparatus: ["Beaker", "Dropper", "Precipitate view panel"],
      effectType: "precipitate" as const,
      expectedProducts: ["Silver chloride solid", "Sodium nitrate solution"],
      teacherPrompt:
        "Ask the student why a solid appears even though both starting solutions were clear.",
    },
  ] as const;

  function getReactionPreset(equation: string) {
    const normalized = normalizeEquation(equation);
    return (
      REACTION_PRESETS.find(
        (preset) => normalizeEquation(preset.equation) === normalized
      ) || null
    );
  }

  const defaultEquation = REACTION_PRESETS[0].equation;
  const amountOptions = [5, 10, 20];
  const [reactionInput, setReactionInput] = useState<string>(defaultEquation);
  const [activeEquation, setActiveEquation] = useState<string>(defaultEquation);
  const [heatLevel, setHeatLevel] = useState(10);

  const activePreset = getReactionPreset(activeEquation);
  const activeProfile = activePreset || inferReactionProfile(activeEquation);
  const generatedReagents = activeProfile.reagents;
  const selectedDefaultReagent = generatedReagents[0]?.id || "generic-0";
  const [selectedReagent, setSelectedReagent] = useState(selectedDefaultReagent);
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [additions, setAdditions] = useState<Array<{ reagentId: string; amount: number }>>([]);

  useEffect(() => {
    setSelectedReagent(generatedReagents[0]?.id || "generic-0");
    setAdditions([]);
  }, [activeEquation]);

  const reagentMap = Object.fromEntries(
    generatedReagents.map((reagent) => [reagent.id, reagent])
  ) as Record<string, LabReagent>;

  const totals = additions.reduce<Record<string, number>>((acc, addition) => {
    acc[addition.reagentId] = (acc[addition.reagentId] || 0) + addition.amount;
    return acc;
  }, {});

  const totalVolume = additions.reduce((sum, addition) => sum + addition.amount, 0);
  const reactantAmounts = generatedReagents.map((reagent) => totals[reagent.id] || 0);
  const matchedVolume =
    reactantAmounts.length > 1 ? Math.min(...reactantAmounts.filter((amount) => amount > 0)) : 0;
  const reactionProgress = Math.min(100, matchedVolume * 5 + heatLevel * 0.15);

  const isGasReaction = activeProfile.effectType === "gas";
  const isNeutralization = activeProfile.effectType === "neutralization";
  const isPrecipitate = activeProfile.effectType === "precipitate";

  const gasStrength = isGasReaction ? Math.min(100, reactionProgress + 10) : 0;
  const precipitateStrength = isPrecipitate ? Math.min(100, reactionProgress + 8) : 0;
  const colorShift = isNeutralization ? Math.min(100, reactionProgress) : 0;
  const temperature = Math.round(
    21 +
      heatLevel * 0.12 +
      (isNeutralization ? reactionProgress * 0.08 : 0) +
      (isGasReaction ? reactionProgress * 0.03 : 0)
  );

  let liquidColor = "#dbeafe";
  let visibleOutcome = "No strong visible change yet.";

  if (isGasReaction && gasStrength > 0) {
    liquidColor = "#fde68a";
    visibleOutcome = "Fizzing bubbles appear as carbon dioxide gas forms.";
  } else if (isNeutralization && colorShift > 0) {
    liquidColor =
      reactantAmounts[0] > reactantAmounts[1]
        ? "#f9a8d4"
        : reactantAmounts[1] > reactantAmounts[0]
          ? "#86efac"
          : "#c4b5fd";
    visibleOutcome =
      reactantAmounts[0] === reactantAmounts[1]
        ? "The indicator moves toward a neutral color."
        : "The indicator shows whether acid or base is still left over.";
  } else if (isPrecipitate && precipitateStrength > 0) {
    liquidColor = "#e2e8f0";
    visibleOutcome = "The solution becomes cloudy as a white precipitate forms.";
  } else if (generatedReagents.length > 0) {
    liquidColor = generatedReagents[0].color;
    visibleOutcome = "The generated lab is ready. Add the listed reactants to test the equation.";
  }

  const beakerFillHeight = Math.max(22, Math.min(84, 24 + totalVolume * 1.4));
  const bubbleCount = Math.max(0, Math.round(gasStrength / 11));
  const cloudOpacity = Math.max(0.08, precipitateStrength / 100);
  const neutralizationLevel =
    reactantAmounts.length >= 2 && reactantAmounts[0] === reactantAmounts[1] && reactantAmounts[0] > 0
      ? "Balanced"
      : reactantAmounts.length >= 2 && reactantAmounts[0] > reactantAmounts[1]
        ? "Acid excess"
        : reactantAmounts.length >= 2 && reactantAmounts[1] > reactantAmounts[0]
          ? "Base excess"
          : "Not enough data";

  const stateLabel = isGasReaction
    ? gasStrength < 20
      ? "Low bubbling"
      : gasStrength < 55
        ? "Moderate bubbling"
        : "High bubbling"
    : isPrecipitate
      ? precipitateStrength < 20
        ? "Slight cloudiness"
        : precipitateStrength < 55
          ? "Visible precipitate"
          : "Heavy precipitate"
      : neutralizationLevel;

  const latestActions = additions.slice(-5).reverse();
  const chartHeights = [0.25, 0.46, 0.68, 0.84, 0.58].map((factor) =>
    Math.max(8, Math.min(94, Math.round(factor * Math.max(reactionProgress, 15))))
  );
  const generatedTitle = activeProfile.title;
  const generatedSummary = activeProfile.summary;
  const teacherPrompt = activeProfile.teacherPrompt;

  useEffect(() => {
    onStateChange?.({
      mode: "virtual-lab",
      data: {
        equation: activeEquation,
        title: generatedTitle,
        effectType: activeProfile.effectType,
        reactants: generatedReagents.map((reagent) => ({
          label: reagent.label,
          amount: totals[reagent.id] || 0,
        })),
        additions: additions.map((addition) => ({
          reagent: reagentMap[addition.reagentId]?.label || addition.reagentId,
          amount: addition.amount,
        })),
        reactionProgress,
        visibleOutcome,
        expectedProducts: [...activeProfile.expectedProducts],
      },
    });
  }, [
    activeEquation,
    activeProfile.effectType,
    activeProfile.expectedProducts,
    additions,
    generatedReagents,
    generatedTitle,
    onStateChange,
    reactionProgress,
    reagentMap,
    totals,
    visibleOutcome,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Reaction-based virtual lab
        </div>
        <div className="mt-1 text-sm text-slate-700">
          Given a chemical reaction equation, this panel generates the reagents,
          apparatus, and visible lab effects for the experiment.
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {REACTION_PRESETS.map((preset) => (
            <button
              key={preset.equation}
              type="button"
              onClick={() => {
                setReactionInput(preset.equation);
                setActiveEquation(preset.equation);
              }}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                activeEquation === preset.equation
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-emerald-200 bg-white text-slate-700 hover:bg-emerald-100",
              ].join(" ")}
            >
              {preset.equation}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Reaction equation
            </div>
            <textarea
              value={reactionInput}
              onChange={(event) => setReactionInput(event.target.value)}
              className="mt-3 min-h-24 w-full rounded-2xl border border-emerald-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-emerald-400"
              placeholder="Enter a chemical reaction equation"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveEquation(reactionInput.trim() || defaultEquation)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Generate virtual lab
              </button>
              <button
                type="button"
                onClick={() => {
                  setReactionInput(defaultEquation);
                  setActiveEquation(defaultEquation);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reset equation
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2 rounded-2xl border border-emerald-200 bg-white p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Heat level
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={heatLevel}
                onChange={(event) => setHeatLevel(Number(event.target.value))}
                className="w-full accent-emerald-600"
              />
              <div className="text-xs text-slate-600">{heatLevel}% applied</div>
            </label>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated lab
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                {generatedTitle}
              </div>
              <div className="mt-1 text-sm text-slate-600">{generatedSummary}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated reagents
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Select one required reactant, choose an amount, then add it to the lab.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {amountOptions.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setSelectedAmount(amount)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    selectedAmount === amount
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-200 bg-white text-slate-700 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  {amount} mL
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {generatedReagents.map((reagent) => (
              <button
                key={reagent.id}
                type="button"
                onClick={() => setSelectedReagent(reagent.id)}
                className={[
                  "rounded-2xl border p-3 text-left transition",
                  selectedReagent === reagent.id
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/60",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {reagent.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {reagent.shortLabel}
                    </div>
                  </div>
                  <div
                    className="h-8 w-8 rounded-full border border-slate-200"
                    style={{ backgroundColor: reagent.color }}
                  />
                </div>
                <div className="mt-3 text-xs text-slate-600">{reagent.note}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setAdditions((current) => [
                  ...current,
                  { reagentId: selectedReagent, amount: selectedAmount },
                ])
              }
              disabled={!generatedReagents.length}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add {selectedAmount} mL of {reagentMap[selectedReagent]?.label || "reactant"}
            </button>
            <button
              type="button"
              onClick={() => setAdditions((current) => current.slice(0, -1))}
              disabled={!additions.length}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo last
            </button>
            <button
              type="button"
              onClick={() => setAdditions([])}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Clear beaker
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Generated apparatus
          </div>
          <div className="mt-4 flex items-end justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-24 w-16 overflow-hidden rounded-b-3xl border-2 border-slate-400 bg-slate-50">
                <div
                  className="absolute inset-x-0 bottom-0 transition-all"
                  style={{
                    height: `${Math.max(22, Math.min(84, beakerFillHeight))}%`,
                    backgroundColor: liquidColor,
                  }}
                />
                <div className="absolute inset-x-2 bottom-2 top-2">
                  {Array.from({ length: bubbleCount }).map((_, index) => (
                    <div
                      key={index}
                      className="absolute rounded-full border border-white/70 bg-white/50"
                      style={{
                        left: `${(index * 17) % 72}%`,
                        bottom: `${(index * 13) % 70}%`,
                        height: `${9 + (index % 3) * 4}px`,
                        width: `${9 + (index % 3) * 4}px`,
                      }}
                    />
                  ))}
                </div>
                {isPrecipitate && (
                  <div
                    className="absolute inset-x-1 bottom-1 rounded-b-2xl bg-white transition-opacity"
                    style={{
                      height: `${Math.max(6, Math.min(26, precipitateStrength / 4))}%`,
                      opacity: cloudOpacity,
                    }}
                  />
                )}
              </div>
              <span className="text-[11px] text-slate-600">Beaker</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="relative h-20 w-4 rounded-full bg-slate-300">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full bg-rose-400"
                  style={{ height: `${Math.max(15, Math.min(90, temperature - 8))}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-600">Thermometer</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-100">
                <div
                  className={[
                    "h-8 w-8 rounded-full transition-opacity",
                    isPrecipitate ? "bg-slate-200" : "bg-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.65)]",
                  ].join(" ")}
                  style={{ opacity: isPrecipitate ? cloudOpacity : Math.max(0.16, reactionProgress / 100) }}
                />
              </div>
              <span className="text-[11px] text-slate-600">
                {isPrecipitate ? "Cloudiness" : "Energy cue"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Equation
              </div>
              <div className="mt-2 break-words font-mono text-xs text-slate-700">
                {activeEquation}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Apparatus list
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {activeProfile.apparatus.join(", ")}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Student action log
            </div>
            <div className="mt-2 space-y-2">
              {latestActions.length ? (
                latestActions.map((addition, index) => (
                  <div
                    key={`${addition.reagentId}-${addition.amount}-${index}`}
                    className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <span>{reagentMap[addition.reagentId]?.label || addition.reagentId}</span>
                    <span className="font-medium">{addition.amount} mL</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No reactants added yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Reaction state panel
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Temperature</span>
              <span className="font-medium">{temperature}°C</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reaction progress</span>
              <span className="font-medium">{reactionProgress}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Visible state</span>
              <span className="font-medium">{stateLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Products</span>
              <span className="font-medium">
                {activeProfile.expectedProducts.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total added</span>
              <span className="font-medium">{totalVolume} mL</span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              What the student sees
            </div>
            <div className="mt-2 text-sm text-slate-700">{visibleOutcome}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Teacher cue
            </div>
            <div className="mt-2 text-sm text-slate-700">{teacherPrompt}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Reactant totals
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
              {generatedReagents.map((reagent) => (
                <div key={reagent.id} className="rounded-xl bg-emerald-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {reagent.shortLabel}
                  </div>
                  <div className="mt-1 font-medium">{totals[reagent.id] || 0} mL</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Reaction timeline
        </div>
        <div className="mt-4 flex h-32 items-end gap-3">
          {chartHeights.map((height, index) => (
            <div key={`${height}-${index}`} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-lg bg-emerald-400"
                style={{ height: `${height}%` }}
              />
              <span className="text-[11px] text-slate-500">s{index + 1}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-slate-600">
          The timeline summarizes how strongly the generated reaction is showing visible
          evidence as the student adds reactants.
        </div>
      </div>
    </div>
  );
}

export function VisualizationSurface({
  mode,
  latestUserMessage,
  onStateChange,
}: {
  mode: "code-tracing" | "virtual-lab";
  latestUserMessage?: string;
  onStateChange?: (state: VisualizationState) => void;
}) {
  if (mode === "code-tracing") {
    return (
      <TraceVisualization
        latestUserMessage={latestUserMessage}
        onStateChange={onStateChange}
      />
    );
  }

  return <VirtualLabVisualization onStateChange={onStateChange} />;
}

function getInitialMessages(appName: string): ChatMessage[] {
  return [
    {
      role: "assistant",
      content: `Welcome to ${appName}! How can I help?`,
    },
  ];
}

export default function AssistantPanel({
  appId,
  appName,
  appVersion,
}: {
  appId: string;
  appName: string;
  appVersion?: number;
}) {
  const displayName = appName.trim() || appId;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getInitialMessages(displayName)
  );
  const [busy, setBusy] = useState(false);
  const [modelLabel, setModelLabel] = useState("Loading model...");
  const [promptMarkdown, setPromptMarkdown] = useState("");
  const [visualFullscreen, setVisualFullscreen] = useState(false);
  const [visualizationState, setVisualizationState] =
    useState<VisualizationState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visualizationMode = useMemo(
    () => detectVisualizationMode(promptMarkdown),
    [promptMarkdown]
  );
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;

  async function loadApp() {
    try {
      const res = await fetch(`/api/apps/${appId}`);
      const body = await res.json();

      if (res.ok && body?.app) {
        setModelLabel(`${body.app.provider} · ${body.app.model}`);
        return;
      }

      setModelLabel("Unknown model");
    } catch {
      setModelLabel("Unknown model");
    }
  }

  function resetSession() {
    setMessages(getInitialMessages(displayName));
    setInput("");
  }

  useEffect(() => {
    void loadApp();
  }, [appId, appVersion]);

  useEffect(() => {
    resetSession();
  }, [appId, appName, appVersion]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPrompt = () => {
      setPromptMarkdown(localStorage.getItem("instruction-doc-md") || "");
    };

    const onPromptUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ markdown?: string }>;
      setPromptMarkdown(customEvent.detail?.markdown || "");
    };

    syncPrompt();
    window.addEventListener("instruction-doc-updated", onPromptUpdate);
    window.addEventListener("focus", syncPrompt);

    return () => {
      window.removeEventListener("instruction-doc-updated", onPromptUpdate);
      window.removeEventListener("focus", syncPrompt);
    };
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const nextMessages = [
      ...messages,
      { role: "user", content: text } as ChatMessage,
    ];

    setInput("");
    setMessages(nextMessages);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appId,
          system: getAssistantSystemPrompt(),
          messages: nextMessages,
          visualizationState,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json");
      const body = isJSON ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = isJSON
          ? body?.error || body?.message || "Server error"
          : String(body).slice(0, 400);

        throw new Error(msg);
      }

      const reply = isJSON ? body?.reply ?? "" : String(body);

      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);

      if (isJSON && body?.provider && body?.model) {
        setModelLabel(`${body.provider} · ${body.model}`);
      }
    } catch (e: any) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Sorry—something went wrong: ${e?.message || e}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <aside className="h-full bg-white flex flex-col">
      <div className="px-4 py-3 border-b bg-emerald-50/70 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Icon
            d="M3 12a9 9 0 1018 0A9 9 0 003 12zm10-4H8v2h5V8zm3 4H8v2h8v-2zm-3 4H8v2h5v-2z"
            className="w-5 h-5 text-slate-600"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Prompt Preview
              </span>
              <span className="text-xs text-slate-500 truncate">{modelLabel}</span>
            </div>
            <h3 className="mt-2 font-semibold truncate">{displayName}</h3>
            <div className="text-xs text-slate-500 truncate">
              Runs the current middle-editor prompt as this app's system prompt.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            className="p-1.5 rounded hover:bg-slate-100"
            title="Refresh"
            onClick={() => {
              resetSession();
              void loadApp();
            }}
          >
            <Icon d="M12 6V3L8 7l4 4V8a4 4 0 110 8 4 4 0 01-3.46-2H6.26A6 6 0 1012 6z" />
          </button>
          <button
            className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
            onClick={resetSession}
            type="button"
          >
            New session
          </button>
        </div>
      </div>

      <div className="px-4 py-3 text-sm text-slate-600 border-b">
        Test how the current prompt behaves with a real user message.
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
        <div className="text-[12px] text-slate-500">
          Preview session {new Date().toLocaleDateString()} · {displayName}
        </div>

        {visualizationMode && (
          <div
            className={[
              "border border-slate-200 bg-white shadow-sm",
              visualFullscreen
                ? "fixed inset-4 z-50 flex flex-col overflow-hidden rounded-3xl"
                : "rounded-2xl",
            ].join(" ")}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {visualFullscreen ? "Fullscreen visualization" : "Visualized element"}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-800">
                  {visualizationMode === "code-tracing"
                    ? visualFullscreen
                      ? "Code tracing visualizer"
                      : "Embedded code trace view"
                    : visualFullscreen
                      ? "Virtual lab visualizer"
                      : "Embedded virtual lab view"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVisualFullscreen((current) => !current)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {visualFullscreen ? "Close" : "Fullscreen"}
              </button>
            </div>
            <div className={visualFullscreen ? "flex-1 overflow-auto bg-slate-50 p-6" : "p-4"}>
              <VisualizationSurface
                mode={visualizationMode}
                latestUserMessage={latestUserMessage}
                onStateChange={setVisualizationState}
              />
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className={[
                  "h-5 w-5 rounded-full",
                  message.role === "assistant" ? "bg-sky-500" : "bg-slate-300",
                ].join(" ")}
              />
              <div className="text-xs text-slate-500">
                {message.role === "assistant" ? `${displayName} preview` : "Test user"}
              </div>
            </div>

            <div className="text-slate-800 leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
          </div>
        ))}

        {busy && <div className="text-sm text-slate-500">Thinking...</div>}
      </div>

      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <button
            className="p-2 rounded-lg border border-slate-300 text-slate-400 cursor-not-allowed"
            title="Attach"
            disabled
            type="button"
          >
            <Icon
              d="M16.5 6.5l-7.8 7.8a3 3 0 11-4.24-4.24L12 2.5a5 5 0 117.07 7.07l-8.49 8.49"
              className="w-5 h-5"
            />
          </button>
          <input
            className="flex-1 h-11 rounded-lg border px-3"
            placeholder="Send a test user message to preview this prompt"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          <button
            className="h-11 px-5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
            onClick={send}
            disabled={busy}
            type="button"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          This panel previews the behavior of the current prompt, not the hint
          assistant.
        </p>
      </div>

      {visualizationMode && visualFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/45"
          onClick={() => setVisualFullscreen(false)}
        />
      )}
    </aside>
  );
}
