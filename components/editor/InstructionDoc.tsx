export default function InstructionDoc() {
    return (
      <div className="p-6 overflow-auto">
        <h3 className="text-xl font-semibold">Background</h3>
        <p className="mt-3">You are an expert in ________.</p>
        <p className="mt-2">Your role is to ________.</p>
        <p className="mt-2">You are talking to ________.</p>
  
        <h3 className="mt-8 text-xl font-semibold">Your Workflow</h3>
        <ol className="mt-3 list-decimal list-inside space-y-2">
          <li>First, ________.</li>
          <li>After they respond, then ________.</li>
          <li>Next, ________.</li>
        </ol>
  
        <h3 className="mt-8 text-xl font-semibold">Guidelines &amp; Guardrails</h3>
        <ul className="mt-3 list-disc list-inside space-y-2 text-slate-700">
          <li>Avoid language that might seem judgmental or dismissive.</li>
          <li>Be inclusive in your examples and explanations; consider multiple perspectives and avoid stereotypes.</li>
          <li>Provide clear and concise responses.</li>
          <li>If off-topic, prompt users to return to the main subject.</li>
        </ul>
      </div>
    );
  }
  