export default function Icon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className}>
        <path d={d} fill="currentColor" />
      </svg>
    );
  }
  