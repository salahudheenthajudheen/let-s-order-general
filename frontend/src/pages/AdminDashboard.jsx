import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminDashboard({ user, onLogout, roleSwitcher }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview, sellers, feed
  const [metrics, setMetrics] = useState({ totalRevenue: 0, totalOrders: 0, totalCustomers: 0 });
  const [globalOrders, setGlobalOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'overview') fetchMetrics();
    if (activeTab === 'sellers') fetchSellers();
    if (activeTab === 'feed') fetchGlobalOrders();
  }, [activeTab]);

  const fetchMetrics = async () => {
    setLoading(true);
    // Count Customers
    const { count: customersCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    // Count Orders
    const { count: ordersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    
    // Total Revenue (all delivered orders)
    const { data: deliveredOrders } = await supabase.from('orders').select('product, quantity').eq('status', 'delivered');
    let revenue = 0;
    
    if (deliveredOrders && deliveredOrders.length > 0) {
      const productNames = [...new Set(deliveredOrders.map(o => o.product))];
      const { data: products } = await supabase.from('products').select('name, price').in('name', productNames);
      
      deliveredOrders.forEach(o => {
        const prod = products?.find(p => p.name === o.product);
        if (prod) {
          revenue += (prod.price * (o.quantity || 1));
        }
      });
    }

    setMetrics({
      totalCustomers: customersCount || 0,
      totalOrders: ordersCount || 0,
      totalRevenue: revenue
    });
    setLoading(false);
  };

  const fetchSellers = async () => {
    setLoading(true);
    const { data } = await supabase.from('sellers').select('*').order('created_at', { ascending: false });
    if (data) setSellers(data);
    setLoading(false);
  };

  const fetchGlobalOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(name), seller:sellers(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setGlobalOrders(data);
    setLoading(false);
  };

  return (
    <div className="dashboard-layout dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <h1>🛡️ Platform Admin</h1>
          <span className="dashboard__subtitle">Global Management</span>
        </div>
        <div className="dashboard__header-right">
          {roleSwitcher}
          <div className="dashboard__user">
            <span className="dashboard__user-email">{user?.email}</span>
            <button className="btn btn--ghost" onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </header>

      <div className="main-nav-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        {['overview', 'sellers', 'feed'].map((tab) => (
          <button
            key={tab}
            className={`btn btn--ghost`}
            onClick={() => setActiveTab(tab)}
            style={{ fontSize: '1.1rem', padding: '0.5rem 1rem', borderBottom: activeTab === tab ? '3px solid var(--primary)' : '0', fontWeight: activeTab === tab ? 'bold' : 'normal' }}
          >
            {tab === 'overview' ? '📊 Platform Analytics' : tab === 'sellers' ? '🏪 Sellers Matrix' : '📡 Global Feed'}
          </button>
        ))}
      </div>

      <main className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="stats-grid">
            <div className="stat-card stat-card--success">
              <div className="stat-card__value">₹{metrics.totalRevenue.toLocaleString()}</div>
              <div className="stat-card__label">Total Platform GMV</div>
              <div className="stat-card__icon">💰</div>
            </div>
            <div className="stat-card stat-card--info">
              <div className="stat-card__value">{metrics.totalOrders.toLocaleString()}</div>
              <div className="stat-card__label">Total Orders Placed</div>
              <div className="stat-card__icon">📦</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{metrics.totalCustomers.toLocaleString()}</div>
              <div className="stat-card__label">Total Registered Customers</div>
              <div className="stat-card__icon">👥</div>
            </div>
          </div>
        )}

        {activeTab === 'sellers' && (
          <div className="sellers-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sellers.length === 0 ? <p>No sellers registered.</p> : sellers.map(s => (
              <div key={s.id} style={{ background: 'var(--surface)', padding: '1.5rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{s.name}</h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.3rem' }}>Registered: {new Date(s.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`status-badge status-${s.is_available ? 'accepted' : 'rejected'}`}>{s.is_available ? 'Active' : 'Inactive'}</span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>ID: {s.id.slice(0, 8)}...</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'feed' && (
          <div className="orders-list">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>Global Feed (Latest 50)</h2>
              <button className="btn btn--secondary btn--sm" onClick={fetchGlobalOrders}>🔄 Refresh</button>
            </div>
            {globalOrders.length === 0 ? <p>No orders on the platform yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {globalOrders.map(o => (
                  <div key={o.id} style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '1.1rem' }}>{o.product} (×{o.quantity})</strong>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Buyer: {o.customer?.name} • Seller: {o.seller?.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{new Date(o.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <span className={`status-badge status-${o.status}`} style={{ textTransform: 'capitalize' }}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
