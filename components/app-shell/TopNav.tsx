export default function TopNav() {
  return (
    <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-7xl h-16 px-4 sm:px-6 lg:px-8 flex items-center">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black tracking-tight text-sky-600">LLM Hint Factory</span>
          <span className="hidden sm:inline text-sm text-slate-500">
            One example bot
          </span>
        </div>
      </div>
    </header>
  );
}
