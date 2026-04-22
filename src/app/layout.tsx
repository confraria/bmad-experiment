import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'bmad-experiment',
  description:
    'A simple, fast todo app — create, view, complete, and delete personal tasks.',
  manifest: '/manifest.webmanifest',
  applicationName: 'bmad',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'bmad',
  },
};

export const viewport: Viewport = {
  themeColor: '#fafafa',
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
