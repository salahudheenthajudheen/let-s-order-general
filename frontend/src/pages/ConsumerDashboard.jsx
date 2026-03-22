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
  }, [activeTab]);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, seller:sellers(name)')
      .order('name');
    if (data) setProducts(data);
    setLoading(false);
  };

  const fetchMyOrders = async () => {
    // Resolve customer row
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('name', user.email)
      .single();

    if (customer) {
      const { data } = await supabase
        .from('orders')
        .select('*, seller:sellers(name)')
        .eq('customer_id', customer.id)
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
          <h1>🛒 Shop Web Portal</h1>
          <span className="dashboard__subtitle">Consumer Dashboard</span>
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
        {['browse', 'cart', 'orders'].map((tab) => (
          <button
            key={tab}
            className={`btn btn--ghost`}
            onClick={() => setActiveTab(tab)}
            style={{ fontSize: '1.1rem', padding: '0.5rem 1rem', borderBottom: activeTab === tab ? '3px solid var(--primary)' : '0', fontWeight: activeTab === tab ? 'bold' : 'normal' }}
          >
            {tab === 'browse' ? '🛍 Browse Catalog' : tab === 'cart' ? `🛒 Cart (${cart.length})` : '📦 My Orders'}
          </button>
        ))}
      </div>

      <main className="dashboard-content">
        {activeTab === 'browse' && (
          <div className="products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            {products.map(p => (
              <div key={p.id} style={{ background: 'var(--surface)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span style={{ color: 'var(--text-secondary)' }}>Sold by: {p.seller?.name || 'Unknown'}</span>
                <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>₹{p.price}</strong>
                <button className="btn btn--secondary" style={{ marginTop: 'auto' }} onClick={() => addToCart(p)}>Add to Cart</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-view" style={{ maxWidth: '600px', margin: '0 auto', background: 'var(--surface)', padding: '2rem', borderRadius: '16px' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Shopping Cart</h2>
            {cart.length === 0 ? <p>Your cart is empty.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {cart.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                    <div>
                      <strong>{item.product.name}</strong>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>₹{item.product.price} × {item.qty}</div>
                    </div>
                    <strong>₹{item.product.price * item.qty}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', marginTop: '1rem' }}>
                  <strong>Total:</strong>
                  <strong>₹{cartTotal}</strong>
                </div>
                <button className="btn btn--primary btn--full" style={{ marginTop: '1rem' }} onClick={placeOrder}>Confirm and Place Order</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="orders-list">
            <h2 style={{ marginBottom: '1.5rem' }}>Order History</h2>
            {myOrders.length === 0 ? <p>You haven't placed any orders yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {myOrders.map(o => (
                  <div key={o.id} style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '1.1rem' }}>{o.product} (×{o.quantity})</strong>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>From: {o.seller?.name || 'Unknown Seller'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div>
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
