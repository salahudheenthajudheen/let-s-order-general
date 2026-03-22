import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import OrderList from '../components/OrderList';
import InventoryList from '../components/InventoryList';
import Analytics from '../components/Analytics';

export default function Dashboard({ user, onLogout, roleSwitcher }) {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'inventory', 'analytics'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, delivered: 0 });
  const [sellerProfile, setSellerProfile] = useState(null);

  useEffect(() => {
    async function initSeller() {
      const { data } = await supabase.from('sellers').select('*').eq('user_id', user.id).single();
      if (data) setSellerProfile(data);
    }
    if (user) initSeller();
  }, [user]);

  const fetchOrders = async () => {
    if (!sellerProfile) return;
    setLoading(true);
    const query = supabase
      .from('orders')
      .select('*, customer:customers(*), seller:sellers(*)')
      .eq('seller_id', sellerProfile.id)
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query.eq('status', filter);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  // Calculate stats
  const calculateStats = (orderList) => {
    const s = { total: orderList.length, pending: 0, accepted: 0, delivered: 0 };
    orderList.forEach((o) => {
      if (o.status === 'pending') s.pending++;
      else if (o.status === 'accepted') s.accepted++;
      else if (o.status === 'delivered') s.delivered++;
    });
    setStats(s);
  };

  // Realtime subscription
  useEffect(() => {
    if (!sellerProfile) return;
    fetchOrders();

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Realtime update:', payload);

          if (payload.eventType === 'INSERT') {
            if (payload.new.seller_id !== sellerProfile.id) return;
            setOrders((prev) => {
              const updated = [payload.new, ...prev];
              calculateStats(updated);
              return updated;
            });
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.seller_id !== sellerProfile.id) return;
            setOrders((prev) => {
              const updated = prev.map((o) =>
                o.id === payload.new.id ? { ...o, ...payload.new } : o
              );
              calculateStats(updated);
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) => {
              const updated = prev.filter((o) => o.id !== payload.old.id);
              calculateStats(updated);
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter, sellerProfile]);

  useEffect(() => {
    calculateStats(orders);
  }, [orders]);

  // Order actions
  const updateOrderStatus = async (orderId, status) => {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order status');
    }
  };

  const handleAccept = (id) => updateOrderStatus(id, 'accepted');
  const handleReject = (id) => updateOrderStatus(id, 'rejected');
  const handleDispatch = (id) => updateOrderStatus(id, 'dispatched');

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <h1>🛍 Let's Order</h1>
          <span className="dashboard__subtitle">Seller Dashboard</span>
        </div>
        <div className="dashboard__header-right">
          {roleSwitcher}
          <div className="dashboard__user">
            <span className="dashboard__user-email">{user?.email}</span>
            <button className="btn btn--ghost" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="main-nav-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        {['orders', 'inventory', 'analytics'].map((tab) => (
          <button
            key={tab}
            className={`btn btn--ghost ${activeTab === tab ? 'active-main-tab' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={{ fontSize: '1.1rem', padding: '0.5rem 1rem', borderBottom: activeTab === tab ? '3px solid var(--primary)' : '0', borderRadius: '4px 4px 0 0', fontWeight: activeTab === tab ? 'bold' : 'normal' }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'inventory' && <InventoryList user={user} sellerProfile={sellerProfile} />}
      {activeTab === 'analytics' && <Analytics user={user} sellerProfile={sellerProfile} />}

      {activeTab === 'orders' && (
        <>
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__value">{stats.total}</div>
          <div className="stat-card__label">Total Orders</div>
          <div className="stat-card__icon">📊</div>
        </div>
        <div className="stat-card stat-card--warning">
          <div className="stat-card__value">{stats.pending}</div>
          <div className="stat-card__label">Pending</div>
          <div className="stat-card__icon">⏳</div>
        </div>
        <div className="stat-card stat-card--success">
          <div className="stat-card__value">{stats.accepted}</div>
          <div className="stat-card__label">Accepted</div>
          <div className="stat-card__icon">✅</div>
        </div>
        <div className="stat-card stat-card--info">
          <div className="stat-card__value">{stats.delivered}</div>
          <div className="stat-card__label">Delivered</div>
          <div className="stat-card__icon">📦</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {['all', 'pending', 'accepted', 'dispatched', 'delivered', 'rejected'].map((f) => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="btn btn--ghost" onClick={fetchOrders} title="Refresh">
          🔄
        </button>
      </div>

      {/* Live indicator */}
      <div className="live-indicator">
        <span className="live-dot" />
        Live — Orders update in real-time
      </div>

      {/* Orders List */}
      <OrderList
        orders={orders}
        loading={loading}
        onAccept={handleAccept}
        onReject={handleReject}
        onDispatch={handleDispatch}
      />
        </>
      )}
    </div>
  );
}
