import {adminDb,adminDbConfigured} from '@/lib/db-admin';
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

export function bridgeApiConfigured(){
  return Boolean(process.env.BRIDGE_API_KEY&&adminDbConfigured());
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
