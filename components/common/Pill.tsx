export default function Pill({
    active,
    children,
    onClick,
  }: {
    active?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition
        ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"}`}
      >
        {children}
      </button>
    );
  }
  