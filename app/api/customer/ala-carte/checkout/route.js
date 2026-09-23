import {adminDb,adminDbConfigured} from '@/lib/db-admin';
import {appBaseUrl,getAlaContext,requireAlaAvailable,clampInt} from '@/lib/ala-carte';
import {stripeClient} from '@/lib/stripe';

export async function POST(request){
  if(!adminDbConfigured())return Response.json({error:'A La Carte server storage is not configured.'},{status:503});
  const body=await request.json().catch(()=>({}));
  const token=String(body.token||'').trim();
  const requestId=String(body.request_id||'').trim();
  const rawItems=Array.isArray(body.items)?body.items:[];
  if(!token||!requestId||requestId.length>120)return Response.json({error:'Invalid payment request.'},{status:400});
  if(!rawItems.length)return Response.json({error:'Please select at least one item.'},{status:400});

  try{
    const context=requireAlaAvailable(await getAlaContext(token,{includePrices:true}));
    const byId=new Map(context.menu.map(item=>[String(item.id),item]));
    const normalized=[];
    let totalQty=0,totalCents=0;

    for(const raw of rawItems){
      const id=String(raw.menu_item_id||'');
      const item=byId.get(id);
      if(!item)throw new Error('One or more items are unavailable.');
      const qty=clampInt(raw.qty,1,100,0);
      if(!qty)throw new Error('Invalid item quantity.');
      if(item.max_per_order!=null&&qty>Number(item.max_per_order))throw new Error(`${item.display_name||item.name} exceeds the per-order maximum.`);
      totalQty+=qty;
      const unit=Number(item.price_cents)||0;
      const line=unit*qty;
      totalCents+=line;
      normalized.push({menu_item_id:id,item_name:item.display_name||item.name,qty,unit_price_cents:unit,line_total_cents:line});
    }

    if(totalQty>context.max_items_per_order)throw new Error(`Maximum ${context.max_items_per_order} skewers per paid order.`);
    if(totalCents<context.minimum_order_cents)throw new Error(`Minimum paid order is $${(context.minimum_order_cents/100).toFixed(2)}.`);

    const {data:existing,error:existingError}=await adminDb()
      .from('ala_carte_orders')
      .select('id,status,stripe_checkout_url,stripe_checkout_session_id')
      .eq('table_token',token)
      .eq('request_id',requestId)
      .maybeSingle();
    if(existingError)throw existingError;
    if(existing){
      if(existing.status==='awaiting_payment'&&existing.stripe_checkout_url)return Response.json({url:existing.stripe_checkout_url,order_id:existing.id,reused:true});
      if(existing.status==='paid')return Response.json({paid:true,order_id:existing.id});
      throw new Error('This payment request has already been used.');
    }

    if(context.cooldown_minutes>0){
      const {data:lastPaid,error:lastPaidError}=await adminDb()
        .from('ala_carte_orders')
        .select('paid_at')
        .eq('table_token',token)
        .eq('status','paid')
        .not('paid_at','is',null)
        .order('paid_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(lastPaidError)throw lastPaidError;
      if(lastPaid?.paid_at){
        const nextAt=new Date(lastPaid.paid_at).getTime()+context.cooldown_minutes*60000;
        if(Date.now()<nextAt)throw new Error(`Please wait ${Math.ceil((nextAt-Date.now())/60000)} minute(s) before the next paid order.`);
      }
    }

    const tableName=String(context.table?.name||'Table');
    const sessionId=context.session?.id==null?null:String(context.session.id);
    const {data:order,error:orderError}=await adminDb()
      .from('ala_carte_orders')
      .insert({
        request_id:requestId,
        table_token:token,
        table_name:tableName,
        session_id:sessionId,
        currency:context.currency,
        amount_total_cents:totalCents,
        status:'awaiting_payment',
      })
      .select('id')
      .single();
    if(orderError)throw orderError;

    const itemRows=normalized.map(item=>({...item,order_id:order.id}));
    const {error:itemError}=await adminDb().from('ala_carte_order_items').insert(itemRows);
    if(itemError){
      await adminDb().from('ala_carte_orders').update({status:'failed',last_error:itemError.message,updated_at:new Date().toISOString()}).eq('id',order.id);
      throw itemError;
    }

    try{
      const stripe=stripeClient();
      const base=appBaseUrl();
      const checkout=await stripe.checkout.sessions.create({
        mode:'payment',
        payment_method_types:['card'],
        client_reference_id:order.id,
        line_items:normalized.map(item=>({
          quantity:item.qty,
          price_data:{
            currency:context.currency,
            unit_amount:item.unit_price_cents,
            product_data:{name:item.item_name},
          },
        })),
        success_url:`${base}/t/${encodeURIComponent(token)}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:`${base}/t/${encodeURIComponent(token)}?payment=cancelled`,
        metadata:{ala_order_id:order.id,table_name:tableName},
        payment_intent_data:{metadata:{ala_order_id:order.id,table_name:tableName}},
        expires_at:Math.floor(Date.now()/1000)+30*60,
      },{idempotencyKey:`ala_checkout_${order.id}`});

      await adminDb().from('ala_carte_orders').update({
        stripe_checkout_session_id:checkout.id,
        stripe_checkout_url:checkout.url,
        updated_at:new Date().toISOString(),
      }).eq('id',order.id);

      return Response.json({url:checkout.url,order_id:order.id});
    }catch(error){
      await adminDb().from('ala_carte_orders').update({status:'failed',last_error:error.message||'Stripe checkout failed',updated_at:new Date().toISOString()}).eq('id',order.id);
      throw error;
    }
  }catch(error){
    return Response.json({error:error.message||'Unable to start payment.'},{status:409});
  }
}
