export default function RightRail({
  assistantOpen,
  onToggleAssistant,
}: {
  assistantOpen: boolean;
  onToggleAssistant: () => void;
}) {
  const Btn = ({
    children,
    active = false,
    onClick,
  }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) => (
    <button
      onClick={onClick}
      className={[
        "w-full h-12 rounded-xl border text-sm",
        active ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-800 hover:bg-slate-50 border-slate-300",
      ].join(" ")}
    >
      {children}
    </button>
  );

  return (
    <aside className="h-full bg-white p-2 md:p-3 flex flex-col gap-2">
      <Btn>References</Btn>
      <Btn>Memory</Btn>
      <Btn active={assistantOpen} onClick={onToggleAssistant}>Assistant</Btn>
      <Btn>Comments</Btn>
      <Btn>Settings</Btn>
      <Btn>Inputs</Btn>
      <Btn>Tools</Btn>
    </aside>
  );
}
