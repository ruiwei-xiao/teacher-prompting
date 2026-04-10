export default function WorkspaceSidebar() {
    return (
      <div className="space-y-1 text-slate-700 dark:text-zinc-300">
        <div className="mb-2 font-semibold text-slate-900 dark:text-zinc-100">My Apps</div>
        <button className="w-full rounded-lg bg-slate-100 px-3.5 py-2 text-left dark:bg-zinc-800 dark:hover:bg-zinc-700">
          My Apps
        </button>
        <button className="w-full rounded-lg px-3.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-zinc-800">
          Starred
        </button>
        <button className="w-full rounded-lg px-3.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-zinc-800">
          Recently Used
        </button>
        <div className="mt-6 text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500">
          Workspaces
        </div>
        <div className="mt-2">
          <div className="mb-1 text-[13px] text-slate-500 dark:text-zinc-500">
            Example Institute AI Collab – Pilot
          </div>
          <button className="w-full rounded-lg bg-sky-100/60 px-3.5 py-2 text-left dark:bg-sky-900/40 dark:text-sky-100">
            Example Institute AI Collab Sandbox
          </button>
          <button className="mt-2 w-full rounded-lg px-3.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-zinc-800">
            + New workspace
          </button>
        </div>
      </div>
    );
  }
  