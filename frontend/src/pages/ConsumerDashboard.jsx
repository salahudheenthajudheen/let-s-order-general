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
    <div className="luminous-theme">
      <header className="luminous-header">
        <div>
          <h1>The Atrium Shop</h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {roleSwitcher}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--lum-text-secondary)', fontSize: '14px', fontWeight: '500' }}>{user?.email}</span>
            <button className="btn btn--ghost" style={{ color: 'var(--lum-primary)', borderColor: 'var(--lum-primary)' }} onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </header>

      <div className="luminous-tabs">
        {['browse', 'cart', 'orders'].map((tab) => (
          <button
            key={tab}
            className={`luminous-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'browse' ? '🛍 Browse Catalog' : tab === 'cart' ? `🛒 Cart (${cart.length})` : '📦 My Orders'}
          </button>
        ))}
      </div>

      <main className="luminous-content">
        {activeTab === 'browse' && (
          <>
            <h2 style={{ marginBottom: '24px', fontSize: '28px' }}>Summer Essentials</h2>
            <div className="luminous-grid">
              {products.map(p => (
                <div key={p.id} className="luminous-card">
                  <h3 style={{ fontSize: '20px' }}>{p.name}</h3>
                  <span style={{ color: 'var(--lum-text-secondary)', fontSize: '14px' }}>Sold by: {p.seller?.name || 'Unknown'}</span>
                  <div className="luminous-price">₹{p.price}</div>
                  <button className="luminous-btn" onClick={() => addToCart(p)}>Add to Cart</button>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'cart' && (
          <div className="luminous-cart-view">
            <h2 style={{ marginBottom: '32px', fontSize: '32px' }}>Shopping Cart</h2>
            {cart.length === 0 ? <p style={{ color: 'var(--lum-text-secondary)' }}>Your cart is empty and waiting for items.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cart.map((item, idx) => (
                  <div key={idx} className="luminous-cart-item">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong style={{ fontSize: '18px', color: 'var(--lum-text-main)' }}>{item.product.name}</strong>
                      <span style={{ color: 'var(--lum-text-secondary)' }}>₹{item.product.price} × {item.qty}</span>
                    </div>
                    <strong style={{ fontSize: '20px', color: 'var(--lum-text-main)' }}>₹{item.product.price * item.qty}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: '800', marginTop: '32px', color: 'var(--lum-text-main)' }}>
                  <span>Total:</span>
                  <span>₹{cartTotal}</span>
                </div>
                <button className="luminous-btn" style={{ marginTop: '40px', width: '100%', padding: '18px', fontSize: '18px' }} onClick={placeOrder}>Confirm and Place Order</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '32px', fontSize: '32px' }}>Order History</h2>
            {myOrders.length === 0 ? <p style={{ color: 'var(--lum-text-secondary)' }}>You haven't placed any orders yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {myOrders.map(o => (
                  <div key={o.id} className="luminous-order-item">
                    <div>
                      <strong style={{ fontSize: '18px', color: 'var(--lum-text-main)' }}>{o.product} (×{o.quantity})</strong>
                      <div style={{ color: 'var(--lum-text-secondary)', marginTop: '8px' }}>From: {o.seller?.name || 'Unknown Seller'}</div>
                      <div style={{ color: 'var(--lum-text-secondary)', marginTop: '4px', fontSize: '14px' }}>{new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span style={{ background: 'var(--lum-surface-low)', color: 'var(--lum-primary)', padding: '8px 16px', borderRadius: '99px', fontWeight: '600', textTransform: 'capitalize', fontSize: '14px' }}>
                        {o.status}
                      </span>
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
