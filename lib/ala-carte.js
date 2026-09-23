import {adminDb,adminDbConfigured} from '@/lib/db-admin';
import {db} from '@/lib/db';
import {stripeConfigured} from '@/lib/stripe';

export const ALA_DEFAULTS={
  enabled:false,
  free_rounds:1,
  cooldown_minutes:0,
  max_items_per_order:30,
  minimum_order_cents:500,
  currency:'aud',
};

export function alaCarteReleaseUnlocked(){
  return String(process.env.ALA_CARTE_RELEASE_UNLOCK||'').toLowerCase()==='true';
}

export function alaCarteRuntimeReady(){
  return alaCarteReleaseUnlocked()&&adminDbConfigured()&&stripeConfigured();
}

export function appBaseUrl(){
  return (process.env.NEXT_PUBLIC_APP_URL||'https://meathouseskewer.com.au').replace(/\/$/,'');
}

export function clampInt(value,min,max,fallback){
  const n=Number(value);
  if(!Number.isFinite(n))return fallback;
  return Math.max(min,Math.min(max,Math.round(n)));
}

export function roundCountFromSession(sessionData){
  const orders=Array.isArray(sessionData?.recent_orders)?sessionData.recent_orders:[];
  return orders.reduce((max,order)=>Math.max(max,Number(order?.round_no)||0),0);
}

export function sessionIsClosed(session){
  if(!session)return true;
  const last=new Date(session.last_order_at).getTime();
  return Number.isFinite(last)&&Date.now()>=last;
}

export async function getAlaSettings(){
  if(!adminDbConfigured())return {...ALA_DEFAULTS};
  const {data,error}=await adminDb().from('ala_carte_settings').select('*').eq('id',1).maybeSingle();
  if(error)throw error;
  return {...ALA_DEFAULTS,...(data||{})};
}

export async function getCustomerSnapshot(tableToken){
  const token=String(tableToken||'').trim();
  if(!token)throw new Error('Missing table token.');
  const {data,error}=await db().rpc('customer_session',{p_table_token:token});
  if(error)throw new Error(error.message||'Unable to load table session.');
  return data;
}

export async function getAlaContext(tableToken,{includePrices=true}={}){
  const settings=await getAlaSettings();
  const snapshot=await getCustomerSnapshot(tableToken);
  const session=snapshot?.session||null;
  const plan=String(session?.skewer_plan||'included').toLowerCase();
  const usedRounds=roundCountFromSession(snapshot);
  const freeRounds=clampInt(settings.free_rounds,0,10,1);
  const freeComplete=plan==='included'&&usedRounds>=freeRounds;
  const closed=sessionIsClosed(session);
  const released=alaCarteRuntimeReady();
  const enabled=Boolean(released&&settings.enabled);
  let prices=[];

  if(includePrices&&enabled&&freeComplete&&!closed&&adminDbConfigured()){
    const {data,error}=await adminDb()
      .from('ala_carte_prices')
      .select('menu_item_id,item_name,price_cents,active,max_per_order,sort_order')
      .eq('active',true)
      .gt('price_cents',0)
      .order('sort_order',{ascending:true});
    if(error)throw error;
    prices=data||[];
  }

  const menuById=new Map((snapshot?.menu||[]).map(item=>[String(item.id),item]));
  const pricedMenu=prices
    .map(price=>{
      const base=menuById.get(String(price.menu_item_id));
      if(!base)return null;
      return {
        ...base,
        price_cents:Number(price.price_cents)||0,
        max_per_order:price.max_per_order==null?null:Number(price.max_per_order),
      };
    })
    .filter(Boolean);

  return {
    enabled,
    released,
    configured:adminDbConfigured()&&stripeConfigured(),
    phase:!session?'inactive':plan==='paid'?'paid_plan':closed?'closed':freeComplete?'ala_carte':'included',
    free_rounds:freeRounds,
    used_rounds:usedRounds,
    free_rounds_remaining:Math.max(0,freeRounds-usedRounds),
    minimum_order_cents:clampInt(settings.minimum_order_cents,0,100000,500),
    max_items_per_order:clampInt(settings.max_items_per_order,1,200,30),
    cooldown_minutes:clampInt(settings.cooldown_minutes,0,60,0),
    currency:String(settings.currency||'aud').toLowerCase(),
    session,
    table:snapshot?.table||null,
    menu:pricedMenu,
  };
}

export function requireAlaAvailable(context){
  if(!context?.released)throw new Error('A La Carte is not released yet.');
  if(!context?.enabled)throw new Error('A La Carte is currently disabled.');
  if(!context?.session)throw new Error('This table is not active.');
  if(context.phase==='paid_plan')throw new Error('This table is on the paid skewer plan.');
  if(context.phase==='included')throw new Error('Free skewer rounds are still available.');
  if(context.phase==='closed')throw new Error('Last order has closed.');
  if(context.phase!=='ala_carte')throw new Error('A La Carte ordering is not available.');
  return context;
}
