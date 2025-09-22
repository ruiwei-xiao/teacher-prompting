import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playlab – AI Collab Sandbox",
  description: "Mocked multi-screen flow for dashboard → create → tour → editor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
