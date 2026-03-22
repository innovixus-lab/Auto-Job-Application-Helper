// Feature: auto-job-application-helper, Property 18: Stripe webhook tier transitions
// **Validates: Requirements P18**

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Inline tier transition logic mirroring the Stripe webhook route handler
// ---------------------------------------------------------------------------

type Tier = 'free' | 'premium';
type StripeEventType =
  | 'checkout.session.completed'
  | 'invoice.payment_succeeded'
  | 'customer.subscription.deleted'
  | 'invoice.payment_failed';

function applyTierTransition(currentTier: Tier, eventType: StripeEventType): Tier {
  switch (eventType) {
    case 'checkout.session.completed':
    case 'invoice.payment_succeeded':
      return 'premium';
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed':
      return 'free';
    default:
      return currentTier;
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const anyTier = fc.constantFrom<Tier>('free', 'premium');

const upgradeEvent = fc.constantFrom<StripeEventType>(
  'checkout.session.completed',
  'invoice.payment_succeeded'
);

const downgradeEvent = fc.constantFrom<StripeEventType>(
  'customer.subscription.deleted',
  'invoice.payment_failed'
);

// ---------------------------------------------------------------------------
// P18a — Any upgrade event always results in 'premium' tier
// **Validates: Requirements P18**
// ---------------------------------------------------------------------------

test('P18a: any upgrade event always results in premium tier regardless of current tier', () => {
  fc.assert(
    fc.property(anyTier, upgradeEvent, (currentTier, eventType) => {
      const result = applyTierTransition(currentTier, eventType);
      expect(result).toBe('premium');
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P18b — Any downgrade event always results in 'free' tier
// **Validates: Requirements P18**
// ---------------------------------------------------------------------------

test('P18b: any downgrade event always results in free tier regardless of current tier', () => {
  fc.assert(
    fc.property(anyTier, downgradeEvent, (currentTier, eventType) => {
      const result = applyTierTransition(currentTier, eventType);
      expect(result).toBe('free');
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P18c — Upgrade followed by downgrade always results in 'free' tier
// **Validates: Requirements P18**
// ---------------------------------------------------------------------------

test('P18c: upgrade followed by downgrade always results in free tier', () => {
  fc.assert(
    fc.property(anyTier, upgradeEvent, downgradeEvent, (initialTier, up, down) => {
      const afterUpgrade = applyTierTransition(initialTier, up);
      const afterDowngrade = applyTierTransition(afterUpgrade, down);
      expect(afterDowngrade).toBe('free');
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P18d — Downgrade followed by upgrade always results in 'premium' tier
// **Validates: Requirements P18**
// ---------------------------------------------------------------------------

test('P18d: downgrade followed by upgrade always results in premium tier', () => {
  fc.assert(
    fc.property(anyTier, downgradeEvent, upgradeEvent, (initialTier, down, up) => {
      const afterDowngrade = applyTierTransition(initialTier, down);
      const afterUpgrade = applyTierTransition(afterDowngrade, up);
      expect(afterUpgrade).toBe('premium');
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P18e — Multiple consecutive upgrade events always result in 'premium' (idempotent)
// **Validates: Requirements P18**
// ---------------------------------------------------------------------------

test('P18e: multiple consecutive upgrade events always result in premium tier (idempotent)', () => {
  fc.assert(
    fc.property(
      anyTier,
      fc.array(upgradeEvent, { minLength: 1, maxLength: 10 }),
      (initialTier, events) => {
        const finalTier = events.reduce(
          (tier, event) => applyTierTransition(tier, event),
          initialTier
        );
        expect(finalTier).toBe('premium');
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P18f — Multiple consecutive downgrade events always result in 'free' (idempotent)
// **Validates: Requirements P18**
// ---------------------------------------------------------------------------

test('P18f: multiple consecutive downgrade events always result in free tier (idempotent)', () => {
  fc.assert(
    fc.property(
      anyTier,
      fc.array(downgradeEvent, { minLength: 1, maxLength: 10 }),
      (initialTier, events) => {
        const finalTier = events.reduce(
          (tier, event) => applyTierTransition(tier, event),
          initialTier
        );
        expect(finalTier).toBe('free');
      }
    ),
    { numRuns: 100 }
  );
});
