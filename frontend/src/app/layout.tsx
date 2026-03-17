import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MATRIQ — Data Analytics Platform",
  description: "AI-powered data analytics through natural conversation",
  keywords: ["analytics", "AI", "data", "dashboard", "SQL", "visualization"],
  authors: [{ name: "MATRIQ Team" }],
  openGraph: {
    title: "MATRIQ — Data Analytics Platform",
    description: "AI-powered data analytics through natural conversation",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#050508" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        {/* Anti-flash script — default dark, respect saved preference */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('matriq-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}