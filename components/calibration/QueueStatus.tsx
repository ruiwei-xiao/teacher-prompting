import { queueStatusLabel } from "@/lib/calibration-ui/gate";

export default function QueueStatus({ queueCount }: { queueCount: number }) {
  return (
    <p
      role="status"
      className="text-sm font-medium text-slate-800 dark:text-zinc-200"
    >
      {queueStatusLabel(queueCount)}
    </p>
  );
}
