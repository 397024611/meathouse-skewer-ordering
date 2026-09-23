import {getAlaContext} from '@/lib/ala-carte';

export const dynamic='force-dynamic';

export async function GET(request){
  try{
    const token=new URL(request.url).searchParams.get('token')||'';
    const context=await getAlaContext(token,{includePrices:true});
    return Response.json({
      enabled:context.enabled,
      phase:context.phase,
      free_rounds:context.free_rounds,
      used_rounds:context.used_rounds,
      free_rounds_remaining:context.free_rounds_remaining,
      minimum_order_cents:context.minimum_order_cents,
      max_items_per_order:context.max_items_per_order,
      cooldown_minutes:context.cooldown_minutes,
      currency:context.currency,
      menu:context.enabled&&context.phase==='ala_carte'?context.menu:[],
    });
  }catch(error){
    return Response.json({enabled:false,error:error.message||'Unable to load A La Carte.'},{status:400});
  }
}
