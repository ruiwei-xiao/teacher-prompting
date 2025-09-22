import Icon from "@/components/common/Icon";

export default function EditorToolbar() {
  return (
    <div className="px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
      <select className="text-sm rounded-md border bg-white px-2 py-1" defaultValue="Header 3">
        <option>Paragraph</option>
        <option>Header 1</option>
        <option>Header 2</option>
        <option>Header 3</option>
      </select>
      <button className="p-1.5 rounded hover:bg-white"><Icon d="M13.5 15H10v4H8V5h6a3.5 3.5 0 010 7 3 3 0 01-.5 6zM10 7v5h3a2.5 2.5 0 000-5h-3z" /></button>
      <button className="p-1.5 rounded hover:bg-white"><Icon d="M10 4v2h2.21l-3.42 12H6v2h8v-2h-2.21l3.42-12H18V4z" /></button>
      <button className="p-1.5 rounded hover:bg-white"><Icon d="M4 11h16v2H4v-2zm8-7c3.314 0 6 1.79 6 4h-3c0-.552-1.343-2-3-2s-3 .895-3 2c0 1.105.895 2 2 2h2c2.761 0 5 2.015 5 4.5S15.761 21 12 21s-6-1.79-6-4h3c0 1.105 1.343 2 3 2s3-.895 3-2c0-1.105-.895-2-2-2h-2C7.239 15 5 12.985 5 10.5 5 8.015 7.239 6 10 6h2z" /></button>
    </div>
  );
}
