import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pedagogical Agent Builder",
  description: "Build, test, and share learning-oriented teaching agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
