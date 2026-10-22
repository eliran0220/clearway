import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Public_Sans } from 'next/font/google';
import './globals.css';

// Public Sans is the US government's design-system typeface: it suits an app built on federal aviation data.
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Clearway',
  description: 'Ask which US airports are worth a terminal-capacity study. Answers come from BTS and FAA data and show their sources and limits.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
