import { db } from '@/lib/db';
import {alaCarteRuntimeReady,getAlaContext} from '@/lib/ala-carte';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const requestId = String(body.request_id || '').trim();
  if (!requestId || requestId.length > 120) {
    return Response.json({ error: 'Invalid order request.' }, { status: 400 });
  }
  if(alaCarteRuntimeReady()){
    try{
      const context=await getAlaContext(String(body.token||''),{includePrices:false});
      if(context.enabled&&context.phase==='ala_carte'){
        return Response.json({error:'Your included skewer rounds are complete. Please use A La Carte for extra skewers.'},{status:409});
      }
    }catch(e){
      console.error('A La Carte gate check failed',e);
      return Response.json({error:'Ordering is temporarily unavailable. Please ask our team.'},{status:503});
    }
  }

  const { data, error } = await db().rpc('submit_customer_order', {
    p_table_token: String(body.token || ''),
    p_items: Array.isArray(body.items) ? body.items : [],
    p_request_id: requestId,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json(data);
}
