'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/manager', label: 'Manager Home', icon: '⌂' },
  { href: '/manager/skewer-plans', label: 'Skewer Plans', icon: '⚙' },
  { href: '/manager/ala-carte', label: 'A La Carte + Stripe', icon: 'A  { href: '/manager/bridge', label: 'System Health', icon: '♥' },
  { href: '/manager/print', label: 'Print Queue', icon: '▤' },
  { href: '/manager/analytics', label: 'Analytics', icon: '▥' },
  { href: '/manager/qr', label: 'QR Codes', icon: '▦' },
  { href: '/manager/vouchers', label: 'Vouchers', icon: '◈' },
  { href: '/staff', label: 'Staff', icon: '◎' },
  { href: '/kitchen', label: 'Kitchen', icon: '≡' },
];

export default function ManagerLayout({ children }) {
  const pathname = usePathname();
  const isHome = pathname === '/manager';
  const [health,setHealth]=useState(null);

  useEffect(()=>{
    if(!isHome)return;
    let cancelled=false;
    async function load(){try{const r=await fetch('/api/manager/dashboard',{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!cancelled)setHealth(j.settings||null);}catch(e){}}
    load();const i=setInterval(load,15000);return()=>{cancelled=true;clearInterval(i)};
  },[isHome]);

  function active(href) {
    if (href === '/manager') return pathname === '/manager';
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  const bridgeOk=health?.bridge_state==='online';
  const stuck=Number(health?.print_stuck_jobs||0);
  const pending=Number(health?.print_pending_jobs||0);
  const healthy=bridgeOk&&stuck===0;

  return <div className="manager-shell">
    <style jsx global>{`
      .manager-shell{min-height:100vh;background:#f5f1ea;color:#241c18;display:grid;grid-template-columns:230px minmax(0,1fr)}
      .manager-sidebar{position:sticky;top:0;height:100vh;background:#211915;color:#fff;padding:24px 16px;display:flex;flex-direction:column;gap:22px;z-index:80;border-right:1px solid rgba(255,255,255,.06)}
      .manager-brand{padding:4px 10px 18px;border-bottom:1px solid rgba(255,255,255,.12)}
      .manager-brand strong{font-size:22px;letter-spacing:.09em;display:block}.manager-brand span{display:block;margin-top:4px;font-size:10px;letter-spacing:.16em;color:#c89a43;font-weight:800}
      .manager-nav{display:grid;gap:7px}.manager-nav a{color:#e9dfd5;text-decoration:none;padding:11px 12px;border-radius:11px;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:800;transition:.15s ease}.manager-nav a:hover{background:rgba(255,255,255,.08);color:#fff}.manager-nav a.active{background:#9e1b1f;color:#fff;box-shadow:0 6px 18px rgba(158,27,31,.22)}
      .manager-nav-icon{width:22px;text-align:center;font-size:17px;color:#c89a43}.manager-nav a.active .manager-nav-icon{color:#fff}
      .manager-sidebar-foot{margin-top:auto;padding:12px 10px 0;border-top:1px solid rgba(255,255,255,.12);font-size:10px;line-height:1.5;color:#9e938b}
      .manager-main{min-width:0}.manager-content{min-height:100vh}.manager-content>.topbar{display:none!important}
      .manager-subhead{height:62px;background:#fff;border-bottom:1px solid #e6ddd3;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:60;box-shadow:0 2px 12px rgba(36,28,24,.04)}
      .manager-home-link{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#5b5049;font-weight:900;font-size:13px;padding:9px 12px;border-radius:10px;background:#f3ede6;border:1px solid #e5d9cd}.manager-home-link:hover{background:#ebe2d8;color:#241c18}
      .manager-current{margin-left:auto;font-size:12px;color:#8b8179;font-weight:800;letter-spacing:.04em}
      .manager-healthbar{margin:18px 30px 0;padding:12px 14px;border-radius:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border:1px solid #d8d0c7;background:#fff;font-size:12px}.manager-healthbar.good{border-color:#9bc9a5;background:#eef8f0}.manager-healthbar.bad{border-color:#df9a9a;background:#fff0f0}.manager-healthbar b{font-size:13px}.manager-healthbar a{margin-left:auto;color:#7f171c;font-weight:900;text-decoration:none}
      .manager-content .page{max-width:1280px;padding:26px 30px 42px}
      .manager-content .hero{border-radius:18px;box-shadow:0 10px 32px rgba(70,25,20,.12);padding:28px 30px}
      .manager-content .card{border-radius:14px;box-shadow:0 5px 18px rgba(36,28,24,.055)}
      .manager-content .actions>.btn{transition:.15s ease}.manager-content .actions>.btn:hover{transform:translateY(-1px)}
      @media(max-width:900px){
        .manager-shell{display:block}.manager-sidebar{position:sticky;top:0;width:100%;height:auto;padding:10px 12px;gap:8px}.manager-brand{display:flex;align-items:baseline;gap:9px;padding:2px 4px 8px}.manager-brand strong{font-size:17px}.manager-brand span{font-size:8px;margin:0}.manager-nav{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.manager-nav::-webkit-scrollbar{display:none}.manager-nav a{white-space:nowrap;padding:8px 10px;font-size:11px}.manager-nav-icon{width:auto;font-size:14px}.manager-sidebar-foot{display:none}.manager-subhead{top:88px;height:52px;padding:0 14px}.manager-healthbar{margin:12px 14px 0}.manager-content .page{padding:16px 14px 32px}.manager-content .hero{padding:20px;border-radius:14px}.manager-content .hero h1{font-size:25px}.manager-current{display:none}
      }
      @media(max-width:520px){.manager-brand{display:none}.manager-subhead{top:53px}.manager-nav a{padding:8px 9px}.manager-healthbar a{margin-left:0;width:100%}}
    `}</style>

    <aside className="manager-sidebar">
      <div className="manager-brand"><strong>MEAT HOUSE</strong><span>MANAGER CONTROL</span></div>
      <nav className="manager-nav">
        {NAV.map(item => <a key={item.href} href={item.href} className={active(item.href) ? 'active' : ''}>
          <span className="manager-nav-icon">{item.icon}</span><span>{item.label}</span>
        </a>)}
      </nav>
      <div className="manager-sidebar-foot">Meat House Skewer Ordering<br/>Canberra · Manager Console</div>
    </aside>

    <div className="manager-main">
      {!isHome && <div className="manager-subhead"><a className="manager-home-link" href="/manager">← Back to Manager Home</a><span className="manager-current">{pathname?.replace('/manager/','').toUpperCase()}</span></div>}
      {isHome&&health&&<div className={`manager-healthbar ${healthy?'good':'bad'}`}><b>{healthy?'● SYSTEM HEALTHY':'● ATTENTION REQUIRED'}</b><span>Bridge: {health.bridge_state?.toUpperCase()||'UNKNOWN'}</span><span>Pending: {pending}</span><span>Stuck: {stuck}</span><a href="/manager/bridge">OPEN SYSTEM HEALTH →</a></div>}
      <div className="manager-content">{children}</div>
    </div>
  </div>;
}
 },
  { href: '/manager/bridge', label: 'System Health', icon: '♥' },
  { href: '/manager/print', label: 'Print Queue', icon: '▤' },
  { href: '/manager/analytics', label: 'Analytics', icon: '▥' },
  { href: '/manager/qr', label: 'QR Codes', icon: '▦' },
  { href: '/manager/vouchers', label: 'Vouchers', icon: '◈' },
  { href: '/staff', label: 'Staff', icon: '◎' },
  { href: '/kitchen', label: 'Kitchen', icon: '≡' },
];

export default function ManagerLayout({ children }) {
  const pathname = usePathname();
  const isHome = pathname === '/manager';
  const [health,setHealth]=useState(null);

  useEffect(()=>{
    if(!isHome)return;
    let cancelled=false;
    async function load(){try{const r=await fetch('/api/manager/dashboard',{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!cancelled)setHealth(j.settings||null);}catch(e){}}
    load();const i=setInterval(load,15000);return()=>{cancelled=true;clearInterval(i)};
  },[isHome]);

  function active(href) {
    if (href === '/manager') return pathname === '/manager';
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  const bridgeOk=health?.bridge_state==='online';
  const stuck=Number(health?.print_stuck_jobs||0);
  const pending=Number(health?.print_pending_jobs||0);
  const healthy=bridgeOk&&stuck===0;

  return <div className="manager-shell">
    <style jsx global>{`
      .manager-shell{min-height:100vh;background:#f5f1ea;color:#241c18;display:grid;grid-template-columns:230px minmax(0,1fr)}
      .manager-sidebar{position:sticky;top:0;height:100vh;background:#211915;color:#fff;padding:24px 16px;display:flex;flex-direction:column;gap:22px;z-index:80;border-right:1px solid rgba(255,255,255,.06)}
      .manager-brand{padding:4px 10px 18px;border-bottom:1px solid rgba(255,255,255,.12)}
      .manager-brand strong{font-size:22px;letter-spacing:.09em;display:block}.manager-brand span{display:block;margin-top:4px;font-size:10px;letter-spacing:.16em;color:#c89a43;font-weight:800}
      .manager-nav{display:grid;gap:7px}.manager-nav a{color:#e9dfd5;text-decoration:none;padding:11px 12px;border-radius:11px;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:800;transition:.15s ease}.manager-nav a:hover{background:rgba(255,255,255,.08);color:#fff}.manager-nav a.active{background:#9e1b1f;color:#fff;box-shadow:0 6px 18px rgba(158,27,31,.22)}
      .manager-nav-icon{width:22px;text-align:center;font-size:17px;color:#c89a43}.manager-nav a.active .manager-nav-icon{color:#fff}
      .manager-sidebar-foot{margin-top:auto;padding:12px 10px 0;border-top:1px solid rgba(255,255,255,.12);font-size:10px;line-height:1.5;color:#9e938b}
      .manager-main{min-width:0}.manager-content{min-height:100vh}.manager-content>.topbar{display:none!important}
      .manager-subhead{height:62px;background:#fff;border-bottom:1px solid #e6ddd3;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:60;box-shadow:0 2px 12px rgba(36,28,24,.04)}
      .manager-home-link{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#5b5049;font-weight:900;font-size:13px;padding:9px 12px;border-radius:10px;background:#f3ede6;border:1px solid #e5d9cd}.manager-home-link:hover{background:#ebe2d8;color:#241c18}
      .manager-current{margin-left:auto;font-size:12px;color:#8b8179;font-weight:800;letter-spacing:.04em}
      .manager-healthbar{margin:18px 30px 0;padding:12px 14px;border-radius:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border:1px solid #d8d0c7;background:#fff;font-size:12px}.manager-healthbar.good{border-color:#9bc9a5;background:#eef8f0}.manager-healthbar.bad{border-color:#df9a9a;background:#fff0f0}.manager-healthbar b{font-size:13px}.manager-healthbar a{margin-left:auto;color:#7f171c;font-weight:900;text-decoration:none}
      .manager-content .page{max-width:1280px;padding:26px 30px 42px}
      .manager-content .hero{border-radius:18px;box-shadow:0 10px 32px rgba(70,25,20,.12);padding:28px 30px}
      .manager-content .card{border-radius:14px;box-shadow:0 5px 18px rgba(36,28,24,.055)}
      .manager-content .actions>.btn{transition:.15s ease}.manager-content .actions>.btn:hover{transform:translateY(-1px)}
      @media(max-width:900px){
        .manager-shell{display:block}.manager-sidebar{position:sticky;top:0;width:100%;height:auto;padding:10px 12px;gap:8px}.manager-brand{display:flex;align-items:baseline;gap:9px;padding:2px 4px 8px}.manager-brand strong{font-size:17px}.manager-brand span{font-size:8px;margin:0}.manager-nav{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.manager-nav::-webkit-scrollbar{display:none}.manager-nav a{white-space:nowrap;padding:8px 10px;font-size:11px}.manager-nav-icon{width:auto;font-size:14px}.manager-sidebar-foot{display:none}.manager-subhead{top:88px;height:52px;padding:0 14px}.manager-healthbar{margin:12px 14px 0}.manager-content .page{padding:16px 14px 32px}.manager-content .hero{padding:20px;border-radius:14px}.manager-content .hero h1{font-size:25px}.manager-current{display:none}
      }
      @media(max-width:520px){.manager-brand{display:none}.manager-subhead{top:53px}.manager-nav a{padding:8px 9px}.manager-healthbar a{margin-left:0;width:100%}}
    `}</style>

    <aside className="manager-sidebar">
      <div className="manager-brand"><strong>MEAT HOUSE</strong><span>MANAGER CONTROL</span></div>
      <nav className="manager-nav">
        {NAV.map(item => <a key={item.href} href={item.href} className={active(item.href) ? 'active' : ''}>
          <span className="manager-nav-icon">{item.icon}</span><span>{item.label}</span>
        </a>)}
      </nav>
      <div className="manager-sidebar-foot">Meat House Skewer Ordering<br/>Canberra · Manager Console</div>
    </aside>

    <div className="manager-main">
      {!isHome && <div className="manager-subhead"><a className="manager-home-link" href="/manager">← Back to Manager Home</a><span className="manager-current">{pathname?.replace('/manager/','').toUpperCase()}</span></div>}
      {isHome&&health&&<div className={`manager-healthbar ${healthy?'good':'bad'}`}><b>{healthy?'● SYSTEM HEALTHY':'● ATTENTION REQUIRED'}</b><span>Bridge: {health.bridge_state?.toUpperCase()||'UNKNOWN'}</span><span>Pending: {pending}</span><span>Stuck: {stuck}</span><a href="/manager/bridge">OPEN SYSTEM HEALTH →</a></div>}
      <div className="manager-content">{children}</div>
    </div>
  </div>;
}
 },
  { href: '/manager/bridge', label: 'System Health', icon: '♥' },
  { href: '/manager/print', label: 'Print Queue', icon: '▤' },
  { href: '/manager/analytics', label: 'Analytics', icon: '▥' },
  { href: '/manager/qr', label: 'QR Codes', icon: '▦' },
  { href: '/manager/vouchers', label: 'Vouchers', icon: '◈' },
  { href: '/staff', label: 'Staff', icon: '◎' },
  { href: '/kitchen', label: 'Kitchen', icon: '≡' },
];

export default function ManagerLayout({ children }) {
  const pathname = usePathname();
  const isHome = pathname === '/manager';
  const [health,setHealth]=useState(null);

  useEffect(()=>{
    if(!isHome)return;
    let cancelled=false;
    async function load(){try{const r=await fetch('/api/manager/dashboard',{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!cancelled)setHealth(j.settings||null);}catch(e){}}
    load();const i=setInterval(load,15000);return()=>{cancelled=true;clearInterval(i)};
  },[isHome]);

  function active(href) {
    if (href === '/manager') return pathname === '/manager';
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  const bridgeOk=health?.bridge_state==='online';
  const stuck=Number(health?.print_stuck_jobs||0);
  const pending=Number(health?.print_pending_jobs||0);
  const healthy=bridgeOk&&stuck===0;

  return <div className="manager-shell">
    <style jsx global>{`
      .manager-shell{min-height:100vh;background:#f5f1ea;color:#241c18;display:grid;grid-template-columns:230px minmax(0,1fr)}
      .manager-sidebar{position:sticky;top:0;height:100vh;background:#211915;color:#fff;padding:24px 16px;display:flex;flex-direction:column;gap:22px;z-index:80;border-right:1px solid rgba(255,255,255,.06)}
      .manager-brand{padding:4px 10px 18px;border-bottom:1px solid rgba(255,255,255,.12)}
      .manager-brand strong{font-size:22px;letter-spacing:.09em;display:block}.manager-brand span{display:block;margin-top:4px;font-size:10px;letter-spacing:.16em;color:#c89a43;font-weight:800}
      .manager-nav{display:grid;gap:7px}.manager-nav a{color:#e9dfd5;text-decoration:none;padding:11px 12px;border-radius:11px;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:800;transition:.15s ease}.manager-nav a:hover{background:rgba(255,255,255,.08);color:#fff}.manager-nav a.active{background:#9e1b1f;color:#fff;box-shadow:0 6px 18px rgba(158,27,31,.22)}
      .manager-nav-icon{width:22px;text-align:center;font-size:17px;color:#c89a43}.manager-nav a.active .manager-nav-icon{color:#fff}
      .manager-sidebar-foot{margin-top:auto;padding:12px 10px 0;border-top:1px solid rgba(255,255,255,.12);font-size:10px;line-height:1.5;color:#9e938b}
      .manager-main{min-width:0}.manager-content{min-height:100vh}.manager-content>.topbar{display:none!important}
      .manager-subhead{height:62px;background:#fff;border-bottom:1px solid #e6ddd3;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:60;box-shadow:0 2px 12px rgba(36,28,24,.04)}
      .manager-home-link{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#5b5049;font-weight:900;font-size:13px;padding:9px 12px;border-radius:10px;background:#f3ede6;border:1px solid #e5d9cd}.manager-home-link:hover{background:#ebe2d8;color:#241c18}
      .manager-current{margin-left:auto;font-size:12px;color:#8b8179;font-weight:800;letter-spacing:.04em}
      .manager-healthbar{margin:18px 30px 0;padding:12px 14px;border-radius:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border:1px solid #d8d0c7;background:#fff;font-size:12px}.manager-healthbar.good{border-color:#9bc9a5;background:#eef8f0}.manager-healthbar.bad{border-color:#df9a9a;background:#fff0f0}.manager-healthbar b{font-size:13px}.manager-healthbar a{margin-left:auto;color:#7f171c;font-weight:900;text-decoration:none}
      .manager-content .page{max-width:1280px;padding:26px 30px 42px}
      .manager-content .hero{border-radius:18px;box-shadow:0 10px 32px rgba(70,25,20,.12);padding:28px 30px}
      .manager-content .card{border-radius:14px;box-shadow:0 5px 18px rgba(36,28,24,.055)}
      .manager-content .actions>.btn{transition:.15s ease}.manager-content .actions>.btn:hover{transform:translateY(-1px)}
      @media(max-width:900px){
        .manager-shell{display:block}.manager-sidebar{position:sticky;top:0;width:100%;height:auto;padding:10px 12px;gap:8px}.manager-brand{display:flex;align-items:baseline;gap:9px;padding:2px 4px 8px}.manager-brand strong{font-size:17px}.manager-brand span{font-size:8px;margin:0}.manager-nav{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.manager-nav::-webkit-scrollbar{display:none}.manager-nav a{white-space:nowrap;padding:8px 10px;font-size:11px}.manager-nav-icon{width:auto;font-size:14px}.manager-sidebar-foot{display:none}.manager-subhead{top:88px;height:52px;padding:0 14px}.manager-healthbar{margin:12px 14px 0}.manager-content .page{padding:16px 14px 32px}.manager-content .hero{padding:20px;border-radius:14px}.manager-content .hero h1{font-size:25px}.manager-current{display:none}
      }
      @media(max-width:520px){.manager-brand{display:none}.manager-subhead{top:53px}.manager-nav a{padding:8px 9px}.manager-healthbar a{margin-left:0;width:100%}}
    `}</style>

    <aside className="manager-sidebar">
      <div className="manager-brand"><strong>MEAT HOUSE</strong><span>MANAGER CONTROL</span></div>
      <nav className="manager-nav">
        {NAV.map(item => <a key={item.href} href={item.href} className={active(item.href) ? 'active' : ''}>
          <span className="manager-nav-icon">{item.icon}</span><span>{item.label}</span>
        </a>)}
      </nav>
      <div className="manager-sidebar-foot">Meat House Skewer Ordering<br/>Canberra · Manager Console</div>
    </aside>

    <div className="manager-main">
      {!isHome && <div className="manager-subhead"><a className="manager-home-link" href="/manager">← Back to Manager Home</a><span className="manager-current">{pathname?.replace('/manager/','').toUpperCase()}</span></div>}
      {isHome&&health&&<div className={`manager-healthbar ${healthy?'good':'bad'}`}><b>{healthy?'● SYSTEM HEALTHY':'● ATTENTION REQUIRED'}</b><span>Bridge: {health.bridge_state?.toUpperCase()||'UNKNOWN'}</span><span>Pending: {pending}</span><span>Stuck: {stuck}</span><a href="/manager/bridge">OPEN SYSTEM HEALTH →</a></div>}
      <div className="manager-content">{children}</div>
    </div>
  </div>;
}
 },
  { href: '/manager/bridge', label: 'System Health', icon: '♥' },
  { href: '/manager/print', label: 'Print Queue', icon: '▤' },
  { href: '/manager/analytics', label: 'Analytics', icon: '▥' },
  { href: '/manager/qr', label: 'QR Codes', icon: '▦' },
  { href: '/manager/vouchers', label: 'Vouchers', icon: '◈' },
  { href: '/staff', label: 'Staff', icon: '◎' },
  { href: '/kitchen', label: 'Kitchen', icon: '≡' },
];

export default function ManagerLayout({ children }) {
  const pathname = usePathname();
  const isHome = pathname === '/manager';
  const [health,setHealth]=useState(null);

  useEffect(()=>{
    if(!isHome)return;
    let cancelled=false;
    async function load(){try{const r=await fetch('/api/manager/dashboard',{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!cancelled)setHealth(j.settings||null);}catch(e){}}
    load();const i=setInterval(load,15000);return()=>{cancelled=true;clearInterval(i)};
  },[isHome]);

  function active(href) {
    if (href === '/manager') return pathname === '/manager';
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  const bridgeOk=health?.bridge_state==='online';
  const stuck=Number(health?.print_stuck_jobs||0);
  const pending=Number(health?.print_pending_jobs||0);
  const healthy=bridgeOk&&stuck===0;

  return <div className="manager-shell">
    <style jsx global>{`
      .manager-shell{min-height:100vh;background:#f5f1ea;color:#241c18;display:grid;grid-template-columns:230px minmax(0,1fr)}
      .manager-sidebar{position:sticky;top:0;height:100vh;background:#211915;color:#fff;padding:24px 16px;display:flex;flex-direction:column;gap:22px;z-index:80;border-right:1px solid rgba(255,255,255,.06)}
      .manager-brand{padding:4px 10px 18px;border-bottom:1px solid rgba(255,255,255,.12)}
      .manager-brand strong{font-size:22px;letter-spacing:.09em;display:block}.manager-brand span{display:block;margin-top:4px;font-size:10px;letter-spacing:.16em;color:#c89a43;font-weight:800}
      .manager-nav{display:grid;gap:7px}.manager-nav a{color:#e9dfd5;text-decoration:none;padding:11px 12px;border-radius:11px;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:800;transition:.15s ease}.manager-nav a:hover{background:rgba(255,255,255,.08);color:#fff}.manager-nav a.active{background:#9e1b1f;color:#fff;box-shadow:0 6px 18px rgba(158,27,31,.22)}
      .manager-nav-icon{width:22px;text-align:center;font-size:17px;color:#c89a43}.manager-nav a.active .manager-nav-icon{color:#fff}
      .manager-sidebar-foot{margin-top:auto;padding:12px 10px 0;border-top:1px solid rgba(255,255,255,.12);font-size:10px;line-height:1.5;color:#9e938b}
      .manager-main{min-width:0}.manager-content{min-height:100vh}.manager-content>.topbar{display:none!important}
      .manager-subhead{height:62px;background:#fff;border-bottom:1px solid #e6ddd3;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:60;box-shadow:0 2px 12px rgba(36,28,24,.04)}
      .manager-home-link{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#5b5049;font-weight:900;font-size:13px;padding:9px 12px;border-radius:10px;background:#f3ede6;border:1px solid #e5d9cd}.manager-home-link:hover{background:#ebe2d8;color:#241c18}
      .manager-current{margin-left:auto;font-size:12px;color:#8b8179;font-weight:800;letter-spacing:.04em}
      .manager-healthbar{margin:18px 30px 0;padding:12px 14px;border-radius:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border:1px solid #d8d0c7;background:#fff;font-size:12px}.manager-healthbar.good{border-color:#9bc9a5;background:#eef8f0}.manager-healthbar.bad{border-color:#df9a9a;background:#fff0f0}.manager-healthbar b{font-size:13px}.manager-healthbar a{margin-left:auto;color:#7f171c;font-weight:900;text-decoration:none}
      .manager-content .page{max-width:1280px;padding:26px 30px 42px}
      .manager-content .hero{border-radius:18px;box-shadow:0 10px 32px rgba(70,25,20,.12);padding:28px 30px}
      .manager-content .card{border-radius:14px;box-shadow:0 5px 18px rgba(36,28,24,.055)}
      .manager-content .actions>.btn{transition:.15s ease}.manager-content .actions>.btn:hover{transform:translateY(-1px)}
      @media(max-width:900px){
        .manager-shell{display:block}.manager-sidebar{position:sticky;top:0;width:100%;height:auto;padding:10px 12px;gap:8px}.manager-brand{display:flex;align-items:baseline;gap:9px;padding:2px 4px 8px}.manager-brand strong{font-size:17px}.manager-brand span{font-size:8px;margin:0}.manager-nav{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.manager-nav::-webkit-scrollbar{display:none}.manager-nav a{white-space:nowrap;padding:8px 10px;font-size:11px}.manager-nav-icon{width:auto;font-size:14px}.manager-sidebar-foot{display:none}.manager-subhead{top:88px;height:52px;padding:0 14px}.manager-healthbar{margin:12px 14px 0}.manager-content .page{padding:16px 14px 32px}.manager-content .hero{padding:20px;border-radius:14px}.manager-content .hero h1{font-size:25px}.manager-current{display:none}
      }
      @media(max-width:520px){.manager-brand{display:none}.manager-subhead{top:53px}.manager-nav a{padding:8px 9px}.manager-healthbar a{margin-left:0;width:100%}}
    `}</style>

    <aside className="manager-sidebar">
      <div className="manager-brand"><strong>MEAT HOUSE</strong><span>MANAGER CONTROL</span></div>
      <nav className="manager-nav">
        {NAV.map(item => <a key={item.href} href={item.href} className={active(item.href) ? 'active' : ''}>
          <span className="manager-nav-icon">{item.icon}</span><span>{item.label}</span>
        </a>)}
      </nav>
      <div className="manager-sidebar-foot">Meat House Skewer Ordering<br/>Canberra · Manager Console</div>
    </aside>

    <div className="manager-main">
      {!isHome && <div className="manager-subhead"><a className="manager-home-link" href="/manager">← Back to Manager Home</a><span className="manager-current">{pathname?.replace('/manager/','').toUpperCase()}</span></div>}
      {isHome&&health&&<div className={`manager-healthbar ${healthy?'good':'bad'}`}><b>{healthy?'● SYSTEM HEALTHY':'● ATTENTION REQUIRED'}</b><span>Bridge: {health.bridge_state?.toUpperCase()||'UNKNOWN'}</span><span>Pending: {pending}</span><span>Stuck: {stuck}</span><a href="/manager/bridge">OPEN SYSTEM HEALTH →</a></div>}
      <div className="manager-content">{children}</div>
    </div>
  </div>;
}
