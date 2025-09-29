import Icon from "@/components/common/Icon";

export default function TopNav() {
  return (
    <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-7xl h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="text-xl font-black tracking-tight text-sky-600">LLM Hint Factory</span>
          <nav className="hidden md:flex items-center gap-6 text-[15px] text-slate-700">
            <a className="hover:text-slate-900" href="#">Apps</a>
            <a className="hover:text-slate-900" href="#">My Activity</a>
            <a className="hover:text-slate-900" href="#">Explore</a>
            <a className="hover:text-slate-900" href="#">Learn</a>
            <a className="hover:text-slate-900" href="#">Blog</a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded hover:bg-slate-100" aria-label="Help">
            <Icon d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm1.07-7.75l-.9.92A1.5 1.5 0 0012 12h-1v-1a3 3 0 013-3c1.66 0 3 1.34 3 3h-2a1 1 0 10-1.93-.25z" />
          </button>
          <div className="h-8 w-8 rounded-full ring-2 ring-emerald-400 grid place-items-center text-xs font-semibold">RX</div>
        </div>
      </div>
    </header>
  );
}
