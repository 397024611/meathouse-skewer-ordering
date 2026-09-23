'use client';

import {useEffect,useMemo,useState} from 'react';

function money(cents){return '$'+((Number(cents)||0)/100).toFixed(2)}

export default function AlaCarteManager(){
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);

  async function load(){
    const r=await fetch('/api/manager/ala-carte',{cache:'no-store'});
    const j=await r.json();
    if(!r.ok){setError(j.error||'Unable to load A La Carte settings.');return}
    setData(j);setError('');
  }

  useEffect(()=>{load()},[]);

  async function saveSettings(){
    setSaving(true);setError('');setMessage('');
    const s=data.settings;
    const r=await fetch('/api/manager/ala-carte',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'settings',...s})});
    const j=await r.json();setSaving(false);
    if(!r.ok){setError(j.error||'Unable to save settings.');return}
    setData(d=>({...d,settings:j}));setMessage('A La Carte settings saved.');
  }

  async function savePrices(){
    setSaving(true);setError('');setMessage('');
    const items=data.menu.map(item=>({
      menu_item_id:item.id,
      active:Boolean(item.ala_active),
      price_cents:Number(item.price_cents)||0,
      max_per_order:item.max_per_order==null?null:Number(item.max_per_order),
    }));
    const r=await fetch('/api/manager/ala-carte',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save_prices',items})});
    const j=await r.json();setSaving(false);
    if(!r.ok){setError(j.error||'Unable to save prices.');return}
    setMessage('A La Carte menu prices saved.');await load();
  }

  function setSetting(key,value){setData(d=>({...d,settings:{...d.settings,[key]:value}}))}
  function setItem(id,key,value){setData(d=>({...d,menu:d.menu.map(x=>x.id===id?{...x,[key]:value}:x)}))}

  const paidTotal=useMemo(()=>data?.orders?.filter(x=>x.status==='paid').reduce((sum,x)=>sum+(Number(x.amount_total_cents)||0),0)||0,[data]);

  if(!data)return <main className="page">Loading…</main>;

  const ready=data.db_configured&&data.stripe_configured;
  const canEnable=ready&&data.release_unlocked;

  return <main className="page">
    <section className="hero"><h1>A La Carte + Stripe</h1><p>Paid extra skewers after included rounds. Development is isolated from the current ordering flow.</p></section>

    {error&&<div className="error" style={{marginTop:14}}>{error}</div>}
    {message&&<div className="notice" style={{marginTop:14}}>{message}</div>}

    <div className="grid grid-3" style={{marginTop:16}}>
      <div className="card"><div className="muted">Database</div><b style={{fontSize:22}}>{data.db_configured?'READY':'NOT CONFIGURED'}</b></div>
      <div className="card"><div className="muted">Stripe</div><b style={{fontSize:22}}>{data.stripe_configured?'READY':'NOT CONFIGURED'}</b></div>
      <div className="card"><div className="muted">Release lock</div><b style={{fontSize:22,color:data.release_unlocked?'#28783d':'#9e1b1f'}}>{data.release_unlocked?'UNLOCKED':'LOCKED'}</b></div>
    </div>

    <div className="card" style={{marginTop:16,border:data.settings.enabled?'2px solid #28783d':'2px solid #c9bfb5'}}>
      <div className="actions">
        <div><h2 style={{margin:0}}>Feature switch</h2><div className="muted" style={{fontSize:12,marginTop:4}}>This remains OFF until Stripe, database, release lock and your final approval are all ready.</div></div>
        <span className="spacer"/>
        <label style={{display:'flex',gap:9,alignItems:'center',fontWeight:900}}>
          <input type="checkbox" disabled={!canEnable} checked={Boolean(data.settings.enabled)} onChange={e=>setSetting('enabled',e.target.checked)}/>
          {data.settings.enabled?'ENABLED':'OFF'}
        </label>
      </div>
      {!canEnable&&<div className="notice" style={{marginTop:12,background:'#fff5df',borderColor:'#e2b75c'}}>Safe mode is active. The customer A La Carte flow cannot be opened yet.</div>}
    </div>

    <div className="grid grid-2" style={{marginTop:16}}>
      <div className="card">
        <h2>Ordering rules</h2>
        <div className="grid grid-2">
          <div className="field"><label>Included free rounds before A La Carte</label><input type="number" min="0" max="10" value={data.settings.free_rounds} onChange={e=>setSetting('free_rounds',Number(e.target.value))}/></div>
          <div className="field"><label>Paid order cooldown (minutes)</label><input type="number" min="0" max="60" value={data.settings.cooldown_minutes} onChange={e=>setSetting('cooldown_minutes',Number(e.target.value))}/></div>
          <div className="field"><label>Max skewers / paid order</label><input type="number" min="1" max="200" value={data.settings.max_items_per_order} onChange={e=>setSetting('max_items_per_order',Number(e.target.value))}/></div>
          <div className="field"><label>Minimum paid order (AUD)</label><input type="number" min="0" step="0.5" value={(Number(data.settings.minimum_order_cents)||0)/100} onChange={e=>setSetting('minimum_order_cents',Math.round(Number(e.target.value)*100))}/></div>
        </div>
        <button className="btn brand" disabled={saving||!data.db_configured} onClick={saveSettings} style={{marginTop:14}}>SAVE RULES</button>
      </div>

      <div className="card">
        <h2>Payment snapshot</h2>
        <div className="muted">Latest 100 A La Carte orders</div>
        <div style={{fontSize:34,fontWeight:900,marginTop:8}}>{money(paidTotal)}</div>
        <div className="muted">Paid total in loaded history</div>
        <div style={{marginTop:12}}>Webhook fulfillment: <b>{data.stripe_configured?'Configured':'Not configured'}</b></div>
      </div>
    </div>

    <div className="section-title"><h3>A La Carte menu & prices</h3></div>
    <div style={{display:'grid',gap:8}}>
      {data.menu.map(item=><div className="card" key={item.id}>
        <div className="actions" style={{alignItems:'center'}}>
          <div style={{minWidth:220,flex:1}}><b>{item.display_name||item.name}</b><div className="muted" style={{fontSize:12}}>{item.portion_label||'1 skewer'}</div></div>
          <label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={Boolean(item.ala_active)} onChange={e=>setItem(item.id,'ala_active',e.target.checked)}/> Sell</label>
          <div className="field" style={{width:130}}><label>Price AUD</label><input type="number" min="0" step="0.1" value={(Number(item.price_cents)||0)/100} onChange={e=>setItem(item.id,'price_cents',Math.round(Number(e.target.value)*100))}/></div>
          <div className="field" style={{width:120}}><label>Max / order</label><input type="number" min="1" placeholder="No max" value={item.max_per_order??''} onChange={e=>setItem(item.id,'max_per_order',e.target.value===''?null:Number(e.target.value))}/></div>
        </div>
      </div>)}
    </div>
    <button className="btn brand" disabled={saving||!data.db_configured} onClick={savePrices} style={{marginTop:14}}>SAVE A LA CARTE PRICES</button>

    <div className="section-title"><h3>Recent paid-order history</h3></div>
    <div style={{display:'grid',gap:8}}>
      {!data.orders.length?<div className="card"><span className="muted">No A La Carte orders yet.</span></div>:data.orders.map(order=><div className="card" key={order.id}>
        <div className="actions"><div><b>{order.table_name}</b><div className="muted" style={{fontSize:12}}>{new Date(order.created_at).toLocaleString()}</div></div><span className="spacer"/><span className={'badge '+(order.status==='paid'?'available':'new')}>{order.status.toUpperCase()}</span><b>{money(order.amount_total_cents)}</b></div>
        <div style={{fontSize:13,marginTop:8}}>{(order.ala_carte_order_items||[]).map(x=>x.item_name+' ×'+x.qty).join(' · ')||'No items'}</div>
      </div>)}
    </div>
  </main>;
}
