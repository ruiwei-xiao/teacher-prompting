"use client";
function Icon({ d, className = "w-4 h-4" }:{ d:string; className?:string }) {
  return <svg viewBox="0 0 24 24" className={className}><path d={d} fill="currentColor"/></svg>;
}
export default function AssistantPanel() {
  return (
    <aside className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon d="M3 12a9 9 0 1018 0A9 9 0 003 12zm10-4H8v2h5V8zm3 4H8v2h8v-2zm-3 4H8v2h5v-2z" className="w-5 h-5 text-slate-600"/>
          <h3 className="font-semibold">LLM Hint Factory Assistant</h3>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-1.5 rounded hover:bg-slate-100" title="Refresh">
            <Icon d="M12 6V3L8 7l4 4V8a4 4 0 110 8 4 4 0 01-3.46-2H6.26A6 6 0 1012 6z"/>
          </button>
          <span className="text-xs px-3 py-1 rounded-lg bg-slate-100">New session</span>
          <button className="p-1.5 rounded hover:bg-slate-100" title="Close">
            <Icon d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.89 18.3 9.17 12 2.9 5.71 4.3 4.29 10.59 10.6l6.3-6.3 1.41 1.41z"/>
          </button>
        </div>
      </div>

      {/* Tip */}
      <div className="px-4 py-3 text-sm text-slate-600 border-b">
        Hey there! Ask me anything, including how you can improve your app.
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
        <div className="text-[12px] text-slate-500">Session 9/22/2025, 11:31 AM · GPT-4o</div>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 rounded-full bg-sky-500" />
          <div className="text-xs inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">Hi</div>
        </div>
        <div className="text-slate-800 leading-relaxed">
          Welcome to the LLM Hint Factory Assistant. I'm here to help you develop ideas or iterate on your prompts.
          You can click the <strong>New session</strong> button in the top right corner at any time to start a new session.
          <br/><br/>
          Would you consider yourself a <strong>(b)</strong>eginner, <strong>(i)</strong>ntermediate, or <strong>(a)</strong>dvanced user?
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <button className="p-1.5 rounded hover:bg-slate-100" title="Copy">
            <Icon d="M16 1H4a2 2 0 00-2 2v12h2V3h12V1zm3 4H8a2 2 0 00-2 2v14h13a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z" />
          </button>
          <button className="p-1.5 rounded hover:bg-slate-100" title="Pin">
            <Icon d="M14 2l4 4-3 3 5 5-2 2-5-5-3 3-4-4L14 2z" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <button className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" title="Attach">
            <Icon d="M16.5 6.5l-7.8 7.8a3 3 0 11-4.24-4.24L12 2.5a5 5 0 117.07 7.07l-8.49 8.49" className="w-5 h-5"/>
          </button>
          <input className="flex-1 h-11 rounded-lg border px-3" placeholder="Enter Message" />
          <button className="h-11 px-5 rounded-lg bg-sky-600 text-white hover:bg-sky-700">Send</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">AI can make mistakes, including bias. Check important information.</p>
      </div>
    </aside>
  );
}
