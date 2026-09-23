import {db} from '@/lib/db';
import {adminDb,adminDbConfigured} from '@/lib/db-admin';
import {getAccessToken,requireRole} from '@/lib/auth';
import {ALA_DEFAULTS,alaCarteReleaseUnlocked,clampInt} from '@/lib/ala-carte';
import {stripeConfigured,stripeMode,stripeSecretConfigured,stripeWebhookConfigured} from '@/lib/stripe';

async function managerMenu(token){
  const {data,error}=await db().rpc('manager_get_menu',{p_secret:token});
  if(error)throw error;
  return data||[];
}

async function managerTables(token){
  const {data,error}=await db().rpc('manager_tables',{p_secret:token});
  if(error)throw error;
  return data||[];
}

function bridgeApiConfigured(){
  return Boolean(process.env.MEATHOUSE_ALA_API_KEY);
}

export async function GET(){
  const role=await requireRole(['manager']);
  if(!role)return Response.json({error:'Manager login required.'},{status:401});
  const token=await getAccessToken();

  try{
    const [menu,tables]=await Promise.all([managerMenu(token),managerTables(token)]);
    const base={
      db_configured:adminDbConfigured(),
      schema_ready:false,
      schema_error:null,
      stripe_secret_configured:stripeSecretConfigured(),
      stripe_webhook_configured:stripeWebhookConfigured(),
      stripe_configured:stripeConfigured(),
      stripe_mode:stripeMode(),
      bridge_api_configured:bridgeApiConfigured(),
      release_unlocked:alaCarteReleaseUnlocked(),
      settings:{...ALA_DEFAULTS},
      menu:menu.map(item=>({...item,ala_active:false,price_cents:0,max_per_order:null})),
      tables:tables.filter(t=>t.active).map(t=>({id:t.id,name:t.name,token:t.token})),
      orders:[],
    };

    if(!adminDbConfigured())return Response.json(base);

    const [settingsRes,pricesRes,ordersRes]=await Promise.all([
      adminDb().from('ala_carte_settings').select('*').eq('id',1).maybeSingle(),
      adminDb().from('ala_carte_prices').select('*').order('sort_order',{ascending:true}),
      adminDb().from('ala_carte_orders').select('id,table_name,status,kitchen_status,amount_total_cents,currency,created_at,paid_at,stripe_checkout_session_id,ala_carte_order_items(item_name,qty,unit_price_cents,line_total_cents)').order('created_at',{ascending:false}).limit(100),
    ]);
    const error=settingsRes.error||pricesRes.error||ordersRes.error;
    if(error){
      return Response.json({...base,schema_ready:false,schema_error:error.message||'A La Carte schema is not ready.'});
    }

    const priceMap=new Map((pricesRes.data||[]).map(row=>[String(row.menu_item_id),row]));
    return Response.json({
      ...base,
      schema_ready:true,
      settings:{...ALA_DEFAULTS,...(settingsRes.data||{})},
      menu:menu.map(item=>{
        const p=priceMap.get(String(item.id));
        return {...item,ala_active:Boolean(p?.active),price_cents:Number(p?.price_cents)||0,max_per_order:p?.max_per_order??null};
      }),
      orders:ordersRes.data||[],
    });
  }catch(error){
    return Response.json({error:error.message||'Unable to load A La Carte settings.'},{status:409});
  }
}

export async function POST(request){
  const role=await requireRole(['manager']);
  if(!role)return Response.json({error:'Manager login required.'},{status:401});
  if(!adminDbConfigured())return Response.json({error:'Server-side Supabase secret is not configured.'},{status:503});

  const token=await getAccessToken();
  const body=await request.json().catch(()=>({}));

  try{
    if(body.action==='settings'){
      const enabled=Boolean(body.enabled);
      const testMode=Boolean(body.test_mode);
      const mode=stripeMode();

      if((enabled||testMode)&&(!alaCarteReleaseUnlocked()||!stripeConfigured()||!bridgeApiConfigured())){
        return Response.json({error:'A La Carte is still locked or Stripe / paid-order printing is not fully configured.'},{status:409});
      }

      if(enabled&&mode!=='live'){
        return Response.json({error:'Full-store A La Carte can only be enabled with a LIVE Stripe secret key.'},{status:409});
      }

      if(testMode&&mode!=='test'){
        return Response.json({error:'Single-table test mode requires a Stripe TEST secret key.'},{status:409});
      }

      const tables=await managerTables(token);
      const activeTokens=new Set(tables.filter(t=>t.active).map(t=>String(t.token)));
      const testTableToken=testMode?String(body.test_table_token||'').trim():null;
      if(testMode&&!activeTokens.has(testTableToken)){
        return Response.json({error:'Choose an active table for test mode.'},{status:409});
      }

      const payload={
        id:1,
        enabled,
        test_mode:testMode,
        test_table_token:testTableToken||null,
        free_rounds:clampInt(body.free_rounds,0,10,1),
        cooldown_minutes:clampInt(body.cooldown_minutes,0,60,0),
        max_items_per_order:clampInt(body.max_items_per_order,1,200,30),
        minimum_order_cents:clampInt(body.minimum_order_cents,0,100000,500),
        currency:'aud',
        updated_at:new Date().toISOString(),
      };

      const {data,error}=await adminDb().from('ala_carte_settings').upsert(payload,{onConflict:'id'}).select('*').single();
      if(error)throw error;
      return Response.json(data);
    }

    if(body.action==='save_prices'){
      const menu=await managerMenu(token);
      const menuMap=new Map(menu.map(item=>[String(item.id),item]));
      const rows=(Array.isArray(body.items)?body.items:[]).map((raw,index)=>{
        const id=String(raw.menu_item_id||'');
        const item=menuMap.get(id);
        if(!item)throw new Error('Unknown menu item.');
        return {
          menu_item_id:id,
          item_name:item.display_name||item.name,
          price_cents:clampInt(raw.price_cents,0,100000,0),
          active:Boolean(raw.active)&&clampInt(raw.price_cents,0,100000,0)>0,
          max_per_order:raw.max_per_order==null?null:clampInt(raw.max_per_order,1,100,1),
          sort_order:Number(item.sort_order)||100+index,
          updated_at:new Date().toISOString(),
        };
      });

      if(rows.length){
        const {error}=await adminDb().from('ala_carte_prices').upsert(rows,{onConflict:'menu_item_id'});
        if(error)throw error;
      }
      return Response.json({saved:true,count:rows.length});
    }

    return Response.json({error:'Unsupported action.'},{status:400});
  }catch(error){
    return Response.json({error:error.message||'Unable to save A La Carte settings.'},{status:409});
  }
}
