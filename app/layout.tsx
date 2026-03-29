import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import ThemeSync from "@/components/theme/ThemeSync";

export const metadata: Metadata = {
  title: "Pedagogical Agent Builder",
  description: "Build, test, and share learning-oriented teaching agents.",
};

const themeInitScript = `(function(){try{var k='theme-preference';var t=localStorage.getItem(k)||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
