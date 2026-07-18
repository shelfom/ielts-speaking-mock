import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TB IELTS Speaking Mock Examiner',
  description:
    'Anonymous IELTS-style Part 1/2/3 speaking mock test with AI scoring. Record audio, get band scores for FC/LR/GRA/P with Chinese written and spoken feedback.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-[var(--bg-surround)] text-[var(--text-primary)]">
        {children}
      </body>
    </html>
  );
}
