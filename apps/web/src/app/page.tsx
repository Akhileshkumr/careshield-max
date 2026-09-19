import { PREMIUM_RULES } from '@careshield/contracts';

import { QuoteForm } from '@/components/quote-form';
import { Card, PageHeading, Stepper } from '@/components/ui';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; age?: string }>;
}) {
  const { name, age } = await searchParams;

  return (
    <>
      <Stepper current={1} />
      <PageHeading
        title="Get your CareShield Max quote"
        description="Answer two questions and see your premium instantly. No documents needed to get a price."
      />

      <Card>
        <QuoteForm defaults={{ name, age }} />
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">How your premium is calculated</h2>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <li>• A base premium of ₹10,000 a year for every applicant.</li>
          <li>
            • A 50% loading on the base premium if you are over{' '}
            {PREMIUM_RULES.AGE_LOADING_THRESHOLD}.
          </li>
          <li>• A flat ₹5,000 if you have pre-existing conditions.</li>
        </ul>
      </Card>
    </>
  );
}
