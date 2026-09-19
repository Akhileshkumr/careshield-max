import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiClientError, getPolicy } from '@/lib/api-client';
import { Card, Money, PageHeading } from '@/components/ui';

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const policy = await getPolicy(id).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  });

  const formatDate = (value: string): string =>
    new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-success-100 text-xl text-success-700"
        >
          ✓
        </span>
        <PageHeading title="You're covered" />
      </div>

      <Card>
        <p role="status" className="sr-only">
          Your policy has been issued. Policy number {policy.policyNumber}.
        </p>

        <dl className="space-y-4">
          <Row label="Policy number">
            <span className="font-mono text-base font-semibold">{policy.policyNumber}</span>
          </Row>
          <Row label="Plan">CareShield Max</Row>
          <Row label="Premium paid">
            <Money amount={policy.premiumPaid} className="font-semibold" />
          </Row>
          <Row label="Cover period">
            {formatDate(policy.effectiveFrom)} – {formatDate(policy.effectiveTo)}
          </Row>
          <Row label="Payment reference">
            <span className="font-mono text-xs">{policy.paymentReference}</span>
          </Row>
        </dl>

        <div
          className="mt-6 rounded-xl border p-4 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          We have emailed your policy documents. Keep your policy number handy for any claim.
        </div>
      </Card>

      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-brand-700 underline underline-offset-4"
      >
        Get another quote
      </Link>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-4 last:border-0 last:pb-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <dt className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
