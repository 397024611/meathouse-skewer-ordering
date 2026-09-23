'use client';

import { useEffect, useMemo, useState } from 'react';

function Login({ done }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const result = await response.json();
    if (!response.ok || !['kitchen', 'manager'].includes(result.role)) {
      setError('Kitchen or Manager PIN required.');
      return;
    }
    done();
  }

  return (
    <main className="page">
      <div className="card" style={{ maxWidth: 380, margin: '80px auto' }}>
        <h1>Kitchen Login</h1>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>PIN</label>
            <input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} />
          </div>
          <button className="btn brand" style={{ width: '100%', marginTop: 12 }}>SIGN IN</button>
        </form>
      </div>
    </main>
  );
}

function formatOrderTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  }).format(new Date(value));
}

function money(cents){return '$'+((Number(cents)||0)/100).toFixed(2);}

function OrderCard({ order, onStatus }) {
  const paid=order.order_type==='ala_carte';
  const nextAction = order.status === 'new'
    ? { label: 'START PREPARING', status: 'preparing', className: 'brand' }
    : order.status === 'preparing'
      ? { label: 'READY TO PICK UP', status: 'ready', className: 'gold' }
      : { label: 'PICKED UP', status: 'picked_up', className: 'secondary' };

  return (
    <div className="card" style={{ marginBottom: 12, border: paid ? '2px solid #c89a43' : undefined }}>
      <div className="actions" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 26 }}>{order.table_name}</h2>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
            {paid ? 'PAID EXTRA · ONLINE PAYMENT' : ('Order #'+order.round_no)} · {formatOrderTime(order.created_at)}
          </div>
        </div>
        <span className="spacer" />
        <span className={paid ? 'badge available' : 'badge new'}>{paid ? ('PAID '+money(order.amount_total_cents)) : ('#'+order.round_no)}</span>
      </div>

      <div style={{ marginTop: 12 }}>
        {order.items.map((item, index) => (
          <div
            key={`${order.id}-${index}`}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontWeight: 800,
            }}
          >
            <span>{item.item_name}</span>
            <span style={{ fontSize: 18 }}>× {item.qty}</span>
          </div>
        ))}
      </div>

      <button
        className={`btn ${nextAction.className}`}
        style={{ width: '100%', marginTop: 14 }}
        onClick={() => onStatus(order.id, nextAction.status)}
      >
        {nextAction.label}
      </button>
    </div>
  );
}

function Column({ title, subtitle, orders, onStatus }) {
  return (
    <section style={{ minWidth: 0 }}>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="actions">
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{subtitle}</div>
          </div>
          <span className="spacer" />
          <span className="badge new">{orders.length}</span>
        </div>
      </div>

      {orders.length ? (
        orders.map((order) => <OrderCard key={order.id} order={order} onStatus={onStatus} />)
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 26 }}>
          <span className="muted">No orders</span>
        </div>
      )}
    </section>
  );
}

export default function Kitchen() {
  const [auth, setAuth] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/kitchen/orders', { cache: 'no-store' });
    const result = await response.json();
    if (response.status === 401) {
      setAuth(false);
      return;
    }
    if (!response.ok) {
      setError(result.error || 'Unable to load kitchen orders.');
      return;
    }
    setAuth(true);
    setError('');
    setOrders(result.orders || []);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  async function setStatus(orderId, status) {
    const response = await fetch('/api/kitchen/orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, status }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || 'Unable to update order.');
      return;
    }
    await load();
  }

  const grouped = useMemo(() => {
    const sortOldestFirst = (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return {
      new: orders.filter((order) => order.status === 'new').sort(sortOldestFirst),
      preparing: orders.filter((order) => order.status === 'preparing').sort(sortOldestFirst),
      ready: orders.filter((order) => order.status === 'ready').sort(sortOldestFirst),
    };
  }, [orders]);

  if (!auth) return <Login done={load} />;

  return (
    <>
      <div className="topbar">
        <div className="logo">MEAT HOUSE<small>SKEWER KITCHEN KDS</small></div>
        <span className="spacer" />
        <button
          className="btn secondary small"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            setAuth(false);
          }}
        >
          Logout
        </button>
      </div>

      <main className="page" style={{ maxWidth: 1600 }}>
        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <Column title="NEW ORDERS" subtitle="Waiting to be started" orders={grouped.new} onStatus={setStatus} />
          <Column title="PREPARING" subtitle="Currently being prepared" orders={grouped.preparing} onStatus={setStatus} />
          <Column title="READY TO PICK UP" subtitle="Waiting for collection" orders={grouped.ready} onStatus={setStatus} />
        </div>
      </main>
    </>
  );
}
