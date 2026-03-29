"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export default function ChatMessageBody({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 underline underline-offset-2 dark:text-sky-400"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt || "Generated illustration"}
              className="my-2 max-h-[min(24rem,70vh)] max-w-full rounded-xl border border-slate-200 object-contain dark:border-zinc-600"
            />
          ),
          p: ({ children }) => (
            <p className="mb-2 whitespace-pre-wrap break-words last:mb-0">{children}</p>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
