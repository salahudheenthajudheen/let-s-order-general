import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ConsumerDashboard({ user, onLogout, roleSwitcher }) {
  const [activeTab, setActiveTab] = useState('browse'); // browse, cart, orders
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
    if (activeTab === 'orders') fetchMyOrders();

    const channel = supabase
      .channel('consumer-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => fetchProducts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { if (activeTab === 'orders') fetchMyOrders(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, seller:sellers(name)')
      .order('name');
    
    if (data) {
      // Group products by seller
      const grouped = {};
      data.forEach(p => {
        const sName = p.seller?.name || 'Unknown Seller';
        if (!grouped[sName]) grouped[sName] = [];
        grouped[sName].push(p);
      });
      setProducts(grouped);
    }
    setLoading(false);
  };

  const fetchMyOrders = async () => {
    // Resolve customer rows: match Web Profile (name) OR Linked Telegram Profile (phone)
    const { data: customerRows } = await supabase
      .from('customers')
      .select('id')
      .or(`name.eq."${user.email}",phone.eq."${user.email}"`);

    if (customerRows && customerRows.length > 0) {
      const customerIds = customerRows.map(c => c.id);
      const { data } = await supabase
        .from('orders')
        .select('*, seller:sellers(name)')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false });
      if (data) setMyOrders(data);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(c => c.product.id === product.id);
    if (existing) {
      setCart(cart.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { product, qty: 1 }]);
    }
    alert(`${product.name} added to cart!`);
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;
    
    // Resolve or create web customer
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('name', user.email)
      .single();

    if (!customer) {
      const { data: newCust } = await supabase
        .from('customers')
        .insert({ name: user.email, language_code: 'en' })
        .select()
        .single();
      customer = newCust;
    }

    if (!customer) {
      alert("Failed to create user profile");
      return;
    }

    const inserts = cart.map(item => ({
      customer_id: customer.id,
      seller_id: item.product.seller_id,
      product: item.product.name,
      quantity: item.qty,
      status: 'pending'
    }));

    const { error } = await supabase.from('orders').insert(inserts);
    if (!error) {
      alert("Order placed successfully!");
      setCart([]);
      await fetchMyOrders();
      setActiveTab('orders');
    } else {
      alert("Failed to place order.");
      console.error(error);
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.product.price * item.qty), 0);

  return (
    <div className="dashboard-layout dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <h1>🛍️ The Atrium Shop</h1>
          <span className="dashboard__subtitle">Consumer Portal</span>
        </div>
        <div className="dashboard__header-right">
          {roleSwitcher}
          <div className="dashboard__user">
            <span className="dashboard__user-email">{user?.email}</span>
            <button className="btn btn--ghost" onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </header>

      <div className="shop-container">
        <main className="shop-content">
          <div className="main-nav-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', paddingBottom: '0.5rem', overflowX: 'auto' }}>
            {['browse', 'orders'].map((tab) => (
              <button
                key={tab}
                className={`btn btn--ghost`}
                onClick={() => setActiveTab(tab)}
                style={{ fontSize: '1.05rem', padding: '0.5rem 1rem', borderBottom: activeTab === tab ? '3px solid var(--accent)' : '0', fontWeight: activeTab === tab ? 'bold' : '500', color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {tab === 'browse' ? '🛍️ Browse Catalog' : '📦 My Orders'}
              </button>
            ))}
          </div>

          {activeTab === 'browse' && (
            <div className="catalog-view" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
              {Object.keys(products).map(sellerName => (
                <div key={sellerName}>
                  <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>🏬 {sellerName}</h2>
                  <div className="stats-grid">
                    {products[sellerName].map(p => (
                      <div key={p.id} className="product-card">
                        <div className="product-card__emoji">🥗</div>
                        <div>
                          <h3 className="product-card__title">{p.name}</h3>
                          <div className="product-card__price">₹{p.price}</div>
                        </div>
                        <div className="product-card__footer">
                          <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => addToCart(p)}>Add to Cart</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(products).length === 0 && !loading && (
                <div className="order-list__empty">
                  <span className="order-list__empty-icon">😔</span>
                  <h3>No products available at the moment.</h3>
                </div>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="orders-view">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', color: 'var(--text-primary)', fontWeight: '700' }}>Order History</h2>
                <button className="btn btn--ghost" onClick={fetchMyOrders} title="Refresh">
                  🔄 Refresh
                </button>
              </div>
              {myOrders.length === 0 ? (
                <div className="order-list__empty" style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <span className="order-list__empty-icon">📦</span>
                  <h3>You haven't placed any orders yet.</h3>
                </div>
              ) : (
                <div className="order-list">
                  {myOrders.map(o => (
                    <div key={o.id} className="order-card">
                      <div className="order-card__header">
                        <span className="order-card__id">#{o.id.split('-')[0]}</span>
                        <span className={`status-badge ${o.status === 'delivered' ? 'btn--accept' : o.status === 'dispatched' ? 'btn--dispatch' : 'btn--ghost'}`} style={{ border: 'none' }}>
                          <span className="status-dot" style={{ background: 'currentColor' }} />
                          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="order-card__body">
                        <div className="order-card__product">
                          <div className="order-card__emoji">📦</div>
                          <div>
                            <h3 style={{ margin: 0 }}>{o.product} <span style={{ color: 'var(--accent)' }}>(×{o.quantity})</span></h3>
                            <p style={{ margin: 0, marginTop: '4px' }}>From: {o.seller?.name || 'Unknown Seller'}</p>
                          </div>
                        </div>
                        
                        <div className="order-card__meta">
                          <div>
                            <span className="meta-label">Total Value</span>
                            <span className="meta-value">₹{(o.quantity * 50)}</span>
                          </div>
                          <div>
                            <span className="meta-label">Ordered On</span>
                            <span className="meta-value">{new Date(o.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="cart-sidebar">
          <div className="cart-sidebar__header">
            <span>🛒 Your Cart</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{cart.length} items</span>
          </div>
          
          {cart.length === 0 ? (
            <div className="order-list__empty" style={{ padding: '32px 16px', border: 'none', background: 'transparent' }}>
              <span className="order-list__empty-icon" style={{ fontSize: '32px', marginBottom: '12px' }}>🛍️</span>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Your cart is empty.</h3>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                {cart.map((item, idx) => (
                  <div key={idx} className="cart-sidebar__item">
                    <div className="cart-sidebar__item-meta">
                      <strong>{item.product.name}</strong>
                      <span>₹{item.product.price} × {item.qty}</span>
                    </div>
                    <div className="cart-sidebar__item-price">
                      ₹{item.product.price * item.qty}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="cart-sidebar__total">
                <span>Total</span>
                <span>₹{cartTotal}</span>
              </div>
              <button className="btn btn--primary" style={{ width: '100%', marginTop: '16px' }} onClick={placeOrder}>Place Order</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
