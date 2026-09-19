import Link from 'next/link';

import { Card, PageHeading } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <PageHeading title="We couldn't find that page" />
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The quote or policy you are looking for does not exist, or the link has expired.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-6 font-semibold text-white transition hover:bg-brand-700"
        >
          Start a new quote
        </Link>
      </Card>
    </>
  );
}
