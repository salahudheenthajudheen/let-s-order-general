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
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="logo-placeholder">🛍️</div>
          <h2>Let's Order</h2>
          <div className="role-badge" style={{background: 'var(--accent)', color: 'white'}}>Consumer</div>
        </div>

        <nav className="sidebar__nav">
          <button
            className={`nav-item ${activeTab === 'browse' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            <span className="nav-item__icon">🛍</span> Browse Catalog
          </button>
          <button
            className={`nav-item ${activeTab === 'cart' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('cart')}
          >
            <span className="nav-item__icon">🛒</span> Cart ({cart.length})
          </button>
          <button
            className={`nav-item ${activeTab === 'orders' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <span className="nav-item__icon">📦</span> My Orders
          </button>
        </nav>

        <div className="sidebar__footer">
          {roleSwitcher}
          <div className="user-info" style={{ marginTop: '16px' }}>
            <span className="user-email" style={{fontSize: '14px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px'}}>{user?.email}</span>
            <button className="btn btn--default" style={{width: '100%', color: '#ff4d4f', borderColor: '#ff4d4f'}} onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>The Atrium Shop</h1>
            <p className="text-secondary" style={{ marginTop: '8px' }}>Discover products from your favorite native sellers.</p>
          </div>
        </header>

        {activeTab === 'browse' && (
          <div className="catalog-view" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            {Object.keys(products).map(sellerName => (
              <div key={sellerName}>
                <h2 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: '600', color: 'var(--text-main)' }}>🏪 {sellerName}</h2>
                <div className="products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '24px' }}>
                  {products[sellerName].map(p => (
                    <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px' }}>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>{p.name}</h3>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', marginBottom: '24px' }}>₹{p.price}</div>
                      </div>
                      <button className="btn btn--primary" onClick={() => addToCart(p)}>Add to Cart</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(products).length === 0 && !loading && (
              <div className="card empty-state">
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>No products available at the moment.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-view" style={{ maxWidth: '800px' }}>
            <h2 style={{ marginBottom: '24px', fontSize: '28px', color: 'var(--text-main)' }}>Shopping Cart</h2>
            {cart.length === 0 ? (
              <div className="card empty-state" style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', opacity: 0.5, marginBottom: '16px' }}>🛒</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>Your cart is empty and waiting for items.</p>
              </div>
            ) : (
              <div className="card" style={{ padding: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <strong style={{ fontSize: '18px', color: 'var(--text-main)' }}>{item.product.name}</strong>
                        <span style={{ color: 'var(--text-secondary)' }}>₹{item.product.price} × {item.qty}</span>
                      </div>
                      <strong style={{ fontSize: '20px', color: 'var(--text-main)' }}>₹{item.product.price * item.qty}</strong>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '24px', fontWeight: '800', marginTop: '32px', color: 'var(--text-main)' }}>
                  <span>Total Payload:</span>
                  <span style={{ color: 'var(--primary)' }}>₹{cartTotal}</span>
                </div>
                <button className="btn btn--primary" style={{ marginTop: '32px', width: '100%', padding: '16px', fontSize: '18px' }} onClick={placeOrder}>Confirm and Place Order</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="orders-view" style={{ maxWidth: '800px' }}>
            <h2 style={{ marginBottom: '24px', fontSize: '28px', color: 'var(--text-main)' }}>Order History</h2>
            {myOrders.length === 0 ? (
              <div className="card empty-state" style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', opacity: 0.5, marginBottom: '16px' }}>📦</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>You haven't placed any orders yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myOrders.map(o => (
                  <div key={o.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px' }}>
                    <div>
                      <strong style={{ fontSize: '18px', color: 'var(--text-main)' }}>{o.product} <span style={{ color: 'var(--primary)' }}>(×{o.quantity})</span></strong>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>From: {o.seller?.name || 'Unknown Seller'}</div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '14px' }}>{new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className={`status-badge status-badge--${o.status}`}>
                        {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
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
