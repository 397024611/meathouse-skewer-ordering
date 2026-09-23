import {adminDbConfigured,adminDb} from '@/lib/db-admin';

export const dynamic='force-dynamic';

export async function GET(request){
  if(!adminDbConfigured())return Response.json({error:'Payment status is not configured.'},{status:503});
  const u=new URL(request.url);
  const token=String(u.searchParams.get('token')||'').trim();
  const checkoutSessionId=String(u.searchParams.get('session_id')||'').trim();
  if(!token||!checkoutSessionId)return Response.json({error:'Missing payment reference.'},{status:400});

  const {data,error}=await adminDb()
    .from('ala_carte_orders')
    .select('id,status,kitchen_status,amount_total_cents,currency,paid_at,stripe_checkout_session_id')
    .eq('table_token',token)
    .eq('stripe_checkout_session_id',checkoutSessionId)
    .maybeSingle();

  if(error)return Response.json({error:error.message},{status:409});
  if(!data)return Response.json({error:'Payment order not found.'},{status:404});
  return Response.json(data);
}
