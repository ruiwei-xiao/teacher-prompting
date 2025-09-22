// components/dashboard/AppCard.tsx
type Props = { app: { id: string; title: string; desc: string }; onEdit?: () => void };

export default function AppCard({ app, onEdit }: Props) {
  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100">Playing</span>
        <button className="p-1 rounded hover:bg-slate-100">⋮</button>
      </div>
      <h3 className="mt-2 text-lg font-semibold">{app.title}</h3>
      <p className="mt-1 text-sm text-slate-600 line-clamp-2">{app.desc}</p>
      <div className="mt-4 pt-4 border-t flex gap-3">
        <button onClick={onEdit} className="rounded-lg border border-slate-300 px-3 h-9 text-sm hover:bg-slate-50">Edit</button>
        <button className="rounded-lg bg-sky-600 px-3 h-9 text-sm text-white hover:bg-sky-700">Launch</button>
      </div>
    </div>
  );
}
