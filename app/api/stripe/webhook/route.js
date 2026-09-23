import {adminDb,adminDbConfigured} from '@/lib/db-admin';
import {stripeClient,stripeWebhookSecret} from '@/lib/stripe';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function paymentIntentId(session){
  const value=session?.payment_intent;
  if(!value)return null;
  return typeof value==='string'?value:value.id||null;
}

async function alreadyProcessed(eventId){
  const {data,error}=await adminDb().from('ala_carte_stripe_events').select('event_id').eq('event_id',eventId).maybeSingle();
  if(error)throw error;
  return Boolean(data);
}

async function recordEvent(event,orderId=null){
  const {error}=await adminDb().from('ala_carte_stripe_events').upsert({
    event_id:event.id,
    event_type:event.type,
    order_id:orderId,
    processed_at:new Date().toISOString(),
  },{onConflict:'event_id'});
  if(error)throw error;
}

async function markPaid(event,session){
  if(session.payment_status!=='paid')return;
  const orderId=String(session.client_reference_id||session.metadata?.ala_order_id||'').trim();
  if(!orderId)throw new Error('Stripe Checkout Session has no A La Carte order reference.');

  const now=new Date().toISOString();
  const {data:order,error:orderError}=await adminDb()
    .from('ala_carte_orders')
    .select('id,status,amount_total_cents,currency')
    .eq('id',orderId)
    .maybeSingle();
  if(orderError)throw orderError;
  if(!order)throw new Error('A La Carte order not found.');

  if(Number(session.amount_total)!==Number(order.amount_total_cents)){
    await adminDb().from('ala_carte_orders').update({
      status:'failed',
      last_error:'Stripe amount did not match server order total.',
      updated_at:now,
    }).eq('id',orderId);
    throw new Error('Stripe amount mismatch.');
  }

  if(order.status!=='paid'){
    const {error:updateError}=await adminDb().from('ala_carte_orders').update({
      status:'paid',
      paid_at:now,
      updated_at:now,
      stripe_checkout_session_id:session.id,
      stripe_payment_intent_id:paymentIntentId(session),
      stripe_event_id:event.id,
      last_error:null,
    }).eq('id',orderId);
    if(updateError)throw updateError;
  }

  const {error:printError}=await adminDb().from('ala_carte_print_jobs').upsert({
    order_id:orderId,
  },{onConflict:'order_id',ignoreDuplicates:true});
  if(printError)throw printError;

  await recordEvent(event,orderId);
}

async function markExpired(event,session){
  const orderId=String(session.client_reference_id||session.metadata?.ala_order_id||'').trim();
  if(!orderId){await recordEvent(event,null);return;}
  const {error}=await adminDb().from('ala_carte_orders').update({
    status:'expired',
    updated_at:new Date().toISOString(),
  }).eq('id',orderId).eq('status','awaiting_payment');
  if(error)throw error;
  await recordEvent(event,orderId);
}

export async function POST(request){
  if(!adminDbConfigured())return new Response('A La Carte database not configured.',{status:503});
  const signature=request.headers.get('stripe-signature');
  if(!signature)return new Response('Missing Stripe signature.',{status:400});

  let event;
  try{
    const raw=await request.text();
    event=stripeClient().webhooks.constructEvent(raw,signature,stripeWebhookSecret());
  }catch(error){
    return new Response(`Webhook signature verification failed: ${error.message}`,{status:400});
  }

  try{
    if(await alreadyProcessed(event.id))return Response.json({received:true,duplicate:true});

    if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
      await markPaid(event,event.data.object);
    }else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
      await markExpired(event,event.data.object);
    }else{
      await recordEvent(event,null);
    }
    return Response.json({received:true});
  }catch(error){
    console.error('Stripe webhook processing failed',event.id,event.type,error);
    return new Response('Webhook processing failed.',{status:500});
  }
}
