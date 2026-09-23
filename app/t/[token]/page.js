'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import LuckySkewerReward from './LuckySkewerReward';
import AlaCartePanel from './AlaCartePanel';

function fmt(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function makeRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function Customer() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [cart, setCart] = useState({});
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [luckyVoucher, setLuckyVoucher] = useState(null);
  const [ala, setAla] = useState(null);
  const submittingRef = useRef(false);

  async function load() {
    const [r,ar] = await Promise.all([
      fetch(`/api/customer/session?token=${encodeURIComponent(token)}`, { cache: 'no-store' }),
      fetch(`/api/customer/ala-carte/context?token=${encodeURIComponent(token)}`, { cache: 'no-store' }).catch(()=>null),
    ]);
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Unable to load table.'); return; }
    let aj=null;
    try{if(ar)aj=await ar.json();}catch(e){}
    setData(j); setAla(aj); setErr('');
  }

  useEffect(() => {
    load();
    const refresh = setInterval(load, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(clock); };
  }, [token]);

  const session = data?.session;
  const menu = useMemo(() => data?.menu || [], [data]);
  const total = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const limit = data?.skewer_limit || 0;
  const rate = data?.skewer_rate_per_guest || 0;
  const diners = session ? Math.max(1, session.adults + session.children_8_12 + session.children_4_7) : 0;
  const wait = session ? Math.max(0, new Date(session.skewer_order_available_at).getTime() - now) : 0;
  const remaining = session ? new Date(session.ends_at).getTime() - now : 0;
  const closed = session ? now >= new Date(session.last_order_at).getTime() : false;
  const alaActive = Boolean(ala?.enabled && ala?.phase === 'ala_carte');

  function change(item, delta) {
    const current = cart[item.id] || 0;
    const next = Math.max(0, current + delta);
    if (item.max_per_round != null && next > item.max_per_round) return;
    if (delta > 0 && total >= limit) return;
    setSuccess('');
    setCart((currentCart) => ({ ...currentCart, [item.id]: next }));
  }

  async function submit() {
    if (!total || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true); setErr(''); setSuccess('');
    const items = Object.entries(cart).filter(([, qty]) => qty > 0).map(([menu_item_id, qty]) => ({ menu_item_id, qty }));
    const request_id = makeRequestId();
    try {
      const r = await fetch('/api/customer/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, items, request_id }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Order failed.'); return; }
      setCart({});
      setSuccess(`Order sent to kitchen ✓ · Round ${j.round}`);
      await load();
      if (j?.voucher) setTimeout(() => setLuckyVoucher(j.voucher), 220);
    } catch (e) {
      setErr('Network error. Please try again.');
    } finally {
      submittingRef.current = false; setBusy(false);
    }
  }

  return <>
    <LuckySkewerReward voucher={luckyVoucher} onClose={() => setLuckyVoucher(null)} />
    <div className="topbar"><div className="logo">MEAT HOUSE<small>UNLIMITED SKEWERS</small></div></div>
    <main className="page" style={{ maxWidth: 760 }}>
      {err && <div className="error">{err}</div>}
      {success && <div className="notice" style={{background:'#ecf8ef',borderColor:'#8fc69b',fontWeight:900,fontSize:16}}>{success}</div>}
      {data && <>
        <section className="hero"><h1>Unlimited Skewers</h1><div className="actions"><span className="badge new">{data.table.name}</span>{session && <span className="badge new">{session.adults + session.children_8_12 + session.children_4_7 + session.under_4} Guests</span>}<span className="spacer" /><b style={{ fontSize: 28 }}>{session ? fmt(remaining) : '--:--'}</b></div></section>
        {!session ? <div className="notice" style={{ marginTop: 14 }}><b>Your table is not active yet.</b><br />Please wait for our team to start your dining session.</div> : alaActive ? <AlaCartePanel token={token} context={ala} onRefresh={load} /> : <>
          <div className="grid grid-2" style={{marginTop:14}}>
            <div className="card" style={{background:'#241c18',color:'#fff'}}><div style={{fontSize:12,opacity:.7}}>THIS ROUND</div><div style={{fontSize:28,fontWeight:900,marginTop:4}}>{total} / {limit}</div><div style={{fontSize:12,opacity:.75}}>skewers selected · {diners} diners × {rate}</div></div>
            <div className="card" style={{background:wait>0?'#fff4df':'#edf8ef',borderColor:wait>0?'#e3b55e':'#8fc69b'}}><div style={{fontSize:12,fontWeight:800}}>NEXT ORDER</div><div style={{fontSize:28,fontWeight:900,marginTop:4}}>{closed?'CLOSED':wait>0?fmt(wait):'READY'}</div><div style={{fontSize:12}}>{wait>0?'Please wait before placing the next round.':'You can place an order now.'}</div></div>
          </div>
          <div className="notice" style={{ marginTop: 10, background: '#fff8e8', borderColor: '#ebc66b' }}>🎁 <b>Lucky Skewer Rewards</b> — Every skewer you order could be the lucky one.</div>
          {closed && <div className="error" style={{ marginTop: 10 }}>Last order has closed for this session.</div>}

          <div className="grid grid-2" style={{ marginTop: 16 }}>{menu.map((item) => {
            const qty = cart[item.id] || 0;
            return <div className="card" key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div><b>{item.display_name || item.name}</b><div className="muted" style={{ fontSize: 12 }}>{item.portion_label} · {item.max_per_round == null ? 'Unlimited per item' : `Max ${item.max_per_round} per round`}</div></div>
              <div className="actions" style={{ flexWrap: 'nowrap' }}><button className="btn secondary small" onClick={() => change(item, -1)}>−</button><b>{qty}</b><button className="btn secondary small" disabled={wait > 0 || closed || total >= limit || (item.max_per_round != null && qty >= item.max_per_round)} onClick={() => change(item, 1)}>+</button></div>
            </div>;
          })}</div>

          <div className="card" style={{ position: 'sticky', bottom: 12, marginTop: 16, background: '#241c18', color: '#fff' }}><div className="actions"><div><b>{total} / {limit} skewers</b><div style={{ fontSize: 12 }}>{busy?'Sending — please do not refresh':wait>0?`Next order in ${fmt(wait)}`:'Ready to order'}</div></div><span className="spacer" /><button className="btn gold" disabled={!total || busy || wait > 0 || closed} onClick={submit}>{busy ? 'SENDING…' : wait>0 ? `WAIT ${fmt(wait)}` : 'PLACE ORDER'}</button></div></div>

          <div className="section-title"><h3>Recent orders</h3></div>
          <div className="card">{!data.recent_orders?.length ? <span className="muted">No orders yet.</span> : data.recent_orders.map((order) => <div key={order.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}><b>Round {order.round_no}</b> · {order.status}<div style={{ fontSize: 13 }}>{order.order_items.map((item) => `${item.item_name} ×${item.qty}`).join(' · ')}</div></div>)}</div>
        </>}
      </>}
    </main>
  </>;
}
