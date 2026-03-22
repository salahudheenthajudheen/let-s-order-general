import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Analytics({ user, sellerProfile }) {
  const [stats, setStats] = useState({ revenue: 0, topProducts: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!sellerProfile) return;
      setLoading(true);
      // Fetch all delivered orders for revenue
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'delivered')
        .eq('seller_id', sellerProfile.id);

      if (!error && orders) {
        let totalRev = 0;
        const productCounts = {};

        orders.forEach(order => {
          // Assume price is embedded in order or we fetch it. 
          // Since our current orders table schema doesn't store total price natively,
          // We'll calculate it using the products table.
          productCounts[order.product] = (productCounts[order.product] || 0) + (order.quantity || 1);
        });

        // We need prices to calculate true revenue. We fetch products that are in these orders.
        const productNames = Object.keys(productCounts);
        let finalRevenue = 0;

        if (productNames.length > 0) {
           const { data: productsData } = await supabase
            .from('products')
            .select('name, price')
            .in('name', productNames);
            
           productsData?.forEach(p => {
             finalRevenue += (p.price * productCounts[p.name]);
           });
        }

        const sortedProducts = Object.entries(productCounts)
          .map(([name, qty]) => ({ name, qty }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5); // top 5

        setStats({ revenue: finalRevenue, topProducts: sortedProducts });
      }
      setLoading(false);
    };

    fetchAnalytics();
  }, []);

  if (loading) return <div className="loading">Calculating analytics...</div>;

  return (
    <div className="analytics-section">
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card stat-card--success" style={{ padding: '2rem' }}>
          <div className="stat-card__label" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Total Delivered Revenue</div>
          <div className="stat-card__value" style={{ fontSize: '3rem' }}>₹{stats.revenue.toLocaleString()}</div>
          <div className="stat-card__icon">💰</div>
        </div>
      </div>

      <div className="analytics-box" style={{ background: 'var(--surface)', padding: '1.5rem', borderRadius: '16px' }}>
        <h3 style={{ marginBottom: '1rem' }}>Top Selling Products</h3>
        {stats.topProducts.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No sales data available yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {stats.topProducts.map((p, index) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>#{index + 1}</span>
                  <strong style={{ fontSize: '1.1rem' }}>{p.name}</strong>
                </div>
                <div style={{ fontWeight: '600', color: 'var(--success)' }}>
                  {p.qty} sold
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
