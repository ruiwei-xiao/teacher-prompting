export default function LeftChat() {
  return (
    <section className="h-full bg-white p-6 flex flex-col">
      <div className="text-sm text-slate-500">Session 9/22/2025, 10:17 AM · Claude 4 Sonnet</div>
      <div className="mt-6 text-slate-800">
        <p>Welcome to PEDAGOGICAL-PROMPTING! Are you ready to get started?</p>
      </div>
      <div className="mt-auto pt-6">
        <div className="flex gap-2">
          <input className="flex-1 h-11 rounded-lg border px-3" placeholder="Enter Message" />
          <button className="h-11 px-4 rounded-lg bg-sky-600 text-white">Send</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">AI can make mistakes, including bias. Check important information.</p>
      </div>
    </section>
  );
}
