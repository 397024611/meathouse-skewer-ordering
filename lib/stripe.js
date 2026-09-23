import Stripe from 'stripe';

let client;

export function stripeConfigured(){
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripeClient(){
  if(!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe secret key is not configured.');
  if(!client) client=new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function stripeWebhookSecret(){
  if(!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook secret is not configured.');
  return process.env.STRIPE_WEBHOOK_SECRET;
}
