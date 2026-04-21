import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bmad-experiment",
  description:
    "A simple, fast todo app — create, view, complete, and delete personal tasks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
