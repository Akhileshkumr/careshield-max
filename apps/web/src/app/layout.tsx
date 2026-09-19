import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'CareShield Max — Health Insurance',
  description: 'Buy CareShield Max health cover online in three steps.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="font-sans antialiased min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>

        <header className="border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white"
            >
              C
            </span>
            <div>
              <p className="text-base font-semibold leading-tight">CareShield Max</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Enterprise health cover
              </p>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
          {children}
        </main>

        <footer
          className="mx-auto max-w-3xl px-4 pb-10 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <p>
            Demonstration application. No real payments are processed and no real cover is
            provided.
          </p>
        </footer>
      </body>
    </html>
  );
}
