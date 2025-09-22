export default function WorkspaceSidebar() {
    return (
      <div className="space-y-1 text-slate-700">
        <div className="font-semibold mb-2">My Apps</div>
        <button className="w-full text-left px-3.5 py-2 rounded-lg bg-slate-100">My Apps</button>
        <button className="w-full text-left px-3.5 py-2 rounded-lg hover:bg-slate-100">Starred</button>
        <button className="w-full text-left px-3.5 py-2 rounded-lg hover:bg-slate-100">Recently Used</button>
        <div className="mt-6 text-xs uppercase tracking-wide text-slate-500">Workspaces</div>
        <div className="mt-2">
          <div className="text-[13px] mb-1 text-slate-500">Carnegie Mellon AI Collab – Pilot</div>
          <button className="w-full text-left px-3.5 py-2 rounded-lg bg-sky-100/60">Carnegie Mellon AI Collab Sandbox</button>
          <button className="mt-2 w-full text-left px-3.5 py-2 rounded-lg hover:bg-slate-100">+ New workspace</button>
        </div>
      </div>
    );
  }
  