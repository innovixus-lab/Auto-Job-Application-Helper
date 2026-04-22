import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import pool from '../db/pool';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

async function upgradeUser(email: string): Promise<void> {
  await pool.query("UPDATE users SET tier = 'premium' WHERE email = $1", [email]);
}

async function downgradeUser(email: string): Promise<void> {
  await pool.query("UPDATE users SET tier = 'free' WHERE email = $1", [email]);
}

// POST /webhooks/stripe — must be mounted with express.raw({ type: 'application/json' })
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_email;
        if (email) await upgradeUser(email);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        if (customer.email) await upgradeUser(customer.email);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        if (customer.email) await downgradeUser(customer.email);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        if (customer.email) await downgradeUser(customer.email);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  res.json({ received: true });
});

export default router;
