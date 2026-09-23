'use client';

import {useEffect,useMemo,useRef,useState} from 'react';

function money(cents){return '$'+((Number(cents)||0)/100).toFixed(2)}
function makeRequestId(){
  if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();
  return Date.now()+'-'+Math.random().toString(36).slice(2);
}

export default function AlaCartePanel({token,context,onRefresh}){
  const [cart,setCart]=useState({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const pollRef=useRef(null);

  const menu=context?.menu||[];
  const totalQty=Object.values(cart).reduce((sum,qty)=>sum+(Number(qty)||0),0);
  const totalCents=useMemo(()=>menu.reduce((sum,item)=>sum+(Number(cart[item.id])||0)*(Number(item.price_cents)||0),0),[menu,cart]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const params=new URLSearchParams(window.location.search);
    const payment=params.get('payment');
    const sessionId=params.get('session_id');
    if(payment==='cancelled'){
      setNotice('Payment cancelled. Your order was not sent to the kitchen.');
      window.history.replaceState({},'',window.location.pathname);
      return;
    }
    if(payment!=='success'||!sessionId)return;

    setNotice('Payment received by Stripe. Confirming your kitchen order…');
    let attempts=0;
    async function check(){
      attempts+=1;
      try{
        const r=await fetch('/api/customer/ala-carte/status?token='+encodeURIComponent(token)+'&session_id='+encodeURIComponent(sessionId),{cache:'no-store'});
        const j=await r.json();
        if(r.ok&&j.status==='paid'){
          setNotice('Payment successful ✓ Your paid skewer order has been sent to the kitchen.');
          window.history.replaceState({},'',window.location.pathname);
          if(onRefresh)onRefresh();
          return;
        }
      }catch(e){}
      if(attempts<15)pollRef.current=setTimeout(check,1500);
      else setNotice('Payment is still being confirmed. Please ask our team if your order does not appear shortly.');
    }
    check();
    return()=>{if(pollRef.current)clearTimeout(pollRef.current)};
  },[token]);

  function change(item,delta){
    const current=Number(cart[item.id])||0;
    const next=Math.max(0,current+delta);
    if(item.max_per_order!=null&&next>Number(item.max_per_order))return;
    if(delta>0&&totalQty>=Number(context.max_items_per_order||30))return;
    setError('');setNotice('');
    setCart(c=>({...c,[item.id]:next}));
  }

  async function checkout(){
    if(!totalQty||busy)return;
    setBusy(true);setError('');setNotice('');
    const items=Object.entries(cart).filter(([,qty])=>Number(qty)>0).map(([menu_item_id,qty])=>({menu_item_id,qty:Number(qty)}));
    try{
      const r=await fetch('/api/customer/ala-carte/checkout',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({token,items,request_id:makeRequestId()}),
      });
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||'Unable to start payment.');
      if(j.paid){
        setNotice('This order is already paid.');
        setBusy(false);
        return;
      }
      if(!j.url)throw new Error('Stripe Checkout URL was not returned.');
      window.location.assign(j.url);
    }catch(e){
      setBusy(false);
      setError(e.message||'Payment could not be started.');
    }
  }

  const minimum=Number(context.minimum_order_cents)||0;
  const belowMinimum=totalCents<minimum;

  return <>
    <div className="card" style={{marginTop:14,background:'#241c18',color:'#fff',border:'2px solid #c89a43'}}>
      <div style={{fontSize:12,fontWeight:900,color:'#e2bd70'}}>FREE SKEWER ROUND COMPLETE ✓</div>
      <h2 style={{margin:'6px 0 4px',fontSize:28}}>Want more skewers?</h2>
      <div style={{opacity:.82}}>Order extra skewers individually and pay securely online. Your order is sent to the kitchen only after payment is confirmed.</div>
    </div>

    {notice&&<div className="notice" style={{marginTop:10,background:'#ecf8ef',borderColor:'#8fc69b',fontWeight:800}}>{notice}</div>}
    {error&&<div className="error" style={{marginTop:10}}>{error}</div>}

    <div className="grid grid-2" style={{marginTop:16}}>
      {menu.map(item=>{
        const qty=Number(cart[item.id])||0;
        const maxed=item.max_per_order!=null&&qty>=Number(item.max_per_order);
        return <div className="card" key={item.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'center'}}>
          <div>
            <b>{item.display_name||item.name}</b>
            <div style={{fontSize:18,fontWeight:900,marginTop:4}}>{money(item.price_cents)} <span className="muted" style={{fontSize:11,fontWeight:600}}>each</span></div>
            <div className="muted" style={{fontSize:12,marginTop:3}}>{item.max_per_order==null?'No item limit':('Max '+item.max_per_order+' per paid order')}</div>
          </div>
          <div className="actions" style={{flexWrap:'nowrap'}}>
            <button className="btn secondary small" onClick={()=>change(item,-1)}>−</button>
            <b>{qty}</b>
            <button className="btn secondary small" disabled={totalQty>=Number(context.max_items_per_order||30)||maxed} onClick={()=>change(item,1)}>+</button>
          </div>
        </div>;
      })}
    </div>

    {!menu.length&&<div className="notice" style={{marginTop:14}}>Paid extra skewers are not configured yet. Please ask our team.</div>}

    <div className="card" style={{position:'sticky',bottom:12,marginTop:16,background:'#241c18',color:'#fff',zIndex:20}}>
      <div className="actions">
        <div>
          <b>{totalQty} skewers · {money(totalCents)}</b>
          <div style={{fontSize:12,opacity:.75}}>{belowMinimum&&totalQty?('Minimum order '+money(minimum)):'Secure online payment with Stripe'}</div>
        </div>
        <span className="spacer"/>
        <button className="btn gold" disabled={!totalQty||busy||belowMinimum||!menu.length} onClick={checkout}>
          {busy?'OPENING PAYMENT…':('PAY & PLACE ORDER · '+money(totalCents))}
        </button>
      </div>
    </div>
  </>;
}
