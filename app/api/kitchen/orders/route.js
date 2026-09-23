import {db} from '@/lib/db';
import {adminDb,adminDbConfigured} from '@/lib/db-admin';
import {getAccessToken,requireRole} from '@/lib/auth';

const ALLOWED=['new','preparing','ready','picked_up'];

export async function GET(){
  const role=await requireRole(['kitchen','manager']);
  if(!role)return Response.json({error:'Kitchen login required.'},{status:401});
  const token=await getAccessToken();
  const regular=await db().rpc('kitchen_orders',{p_secret:token});
  if(regular.error)return Response.json({error:regular.error.message},{status:409});

  let paid=[];
  if(adminDbConfigured()){
    const {data,error}=await adminDb()
      .from('ala_carte_orders')
      .select('id,table_name,kitchen_status,created_at,amount_total_cents,currency,ala_carte_order_items(item_name,qty)')
      .eq('status','paid')
      .in('kitchen_status',['new','preparing','ready'])
      .order('created_at',{ascending:true});
    if(error)return Response.json({error:error.message},{status:409});
    paid=(data||[]).map(order=>({
      id:'ala:'+order.id,
      table_name:order.table_name,
      status:order.kitchen_status,
      round_no:0,
      created_at:order.created_at,
      items:(order.ala_carte_order_items||[]).map(item=>({item_name:item.item_name,qty:item.qty})),
      order_type:'ala_carte',
      amount_total_cents:Number(order.amount_total_cents)||0,
      currency:order.currency||'aud',
    }));
  }

  return Response.json({role,orders:[...(regular.data||[]),...paid]});
}

export async function PATCH(request){
  const role=await requireRole(['kitchen','manager']);
  if(!role)return Response.json({error:'Kitchen login required.'},{status:401});
  const token=await getAccessToken();
  const b=await request.json().catch(()=>({}));
  const orderId=String(b.order_id||'');
  const status=String(b.status||'');

  if(orderId.startsWith('ala:')){
    if(!adminDbConfigured())return Response.json({error:'Paid-order database is not configured.'},{status:503});
    if(!ALLOWED.includes(status))return Response.json({error:'Invalid kitchen status.'},{status:400});
    const id=orderId.slice(4);
    const {data,error}=await adminDb().from('ala_carte_orders').update({
      kitchen_status:status,
      updated_at:new Date().toISOString(),
    }).eq('id',id).eq('status','paid').select('id,kitchen_status').maybeSingle();
    if(error)return Response.json({error:error.message},{status:409});
    if(!data)return Response.json({error:'Paid order not found.'},{status:404});
    return Response.json(data);
  }

  const {data,error}=await db().rpc('kitchen_order_action',{p_secret:token,p_order_id:orderId,p_status:status});
  if(error)return Response.json({error:error.message},{status:409});
  return Response.json(data);
}
