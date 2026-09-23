import {adminDb,adminDbConfigured} from '@/lib/db-admin';

export const dynamic='force-dynamic';

function authorized(request){
  const expected=String(process.env.MEATHOUSE_ALA_API_KEY||'');
  if(!expected)return false;
  const auth=String(request.headers.get('authorization')||'');
  return auth==='Bearer '+expected;
}

export async function GET(request){
  if(!authorized(request))return Response.json({error:'Unauthorized.'},{status:401});
  if(!adminDbConfigured())return Response.json({error:'Database not configured.'},{status:503});

  const {data,error}=await adminDb()
    .from('ala_carte_print_jobs')
    .select('id,order_id,printer1_done,printer2_done,created_at,ala_carte_orders(id,table_name,amount_total_cents,currency,paid_at,ala_carte_order_items(item_name,qty))')
    .is('completed_at',null)
    .order('created_at',{ascending:true})
    .limit(20);

  if(error)return Response.json({error:error.message},{status:409});
  const jobs=(data||[]).map(job=>{
    const order=job.ala_carte_orders||{};
    return {
      job_id:job.id,
      order_id:job.order_id,
      table_name:order.table_name||'Table',
      amount_total_cents:Number(order.amount_total_cents)||0,
      currency:order.currency||'aud',
      paid_at:order.paid_at,
      printer1_done:Boolean(job.printer1_done),
      printer2_done:Boolean(job.printer2_done),
      items:(order.ala_carte_order_items||[]).map(item=>({item_name:item.item_name,qty:Number(item.qty)||0})),
    };
  });
  return Response.json({jobs});
}

export async function POST(request){
  if(!authorized(request))return Response.json({error:'Unauthorized.'},{status:401});
  if(!adminDbConfigured())return Response.json({error:'Database not configured.'},{status:503});

  const body=await request.json().catch(()=>({}));
  const jobId=String(body.job_id||'').trim();
  const printer=Number(body.printer);
  if(!jobId||![1,2].includes(printer))return Response.json({error:'Invalid print acknowledgement.'},{status:400});

  const {data:job,error:readError}=await adminDb()
    .from('ala_carte_print_jobs')
    .select('id,printer1_done,printer2_done')
    .eq('id',jobId)
    .maybeSingle();
  if(readError)return Response.json({error:readError.message},{status:409});
  if(!job)return Response.json({error:'Print job not found.'},{status:404});

  const now=new Date().toISOString();
  const next1=printer===1?true:Boolean(job.printer1_done);
  const next2=printer===2?true:Boolean(job.printer2_done);
  const patch=printer===1
    ?{printer1_done:true,printer1_done_at:now}
    :{printer2_done:true,printer2_done_at:now};
  if(next1&&next2)patch.completed_at=now;

  const {error}=await adminDb().from('ala_carte_print_jobs').update(patch).eq('id',jobId);
  if(error)return Response.json({error:error.message},{status:409});
  return Response.json({ok:true,completed:Boolean(next1&&next2)});
}
