import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function InventoryList({ user, sellerProfile }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  // New Product Form State
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');

  const fetchProducts = async () => {
    setLoading(true);
    // Ideally we filter by seller_id here if the seller was authenticated
    const { data, error } = await supabase
      .from('products')
      .select('*, seller:sellers(name)')
      .eq('seller_id', sellerProfile?.id)
      .order('name');
      
    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleUpdate = async (id, field, value) => {
    const { error } = await supabase
      .from('products')
      .update({ [field]: value })
      .eq('id', id);
      
    if (!error) {
      setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newName || !newPrice || !newStock) return;
    
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: newName,
        price: parseFloat(newPrice),
        stock: parseInt(newStock, 10),
        seller_id: sellerProfile?.id 
      })
      .select()
      .single();

    if (!error && data) {
      setProducts([{ ...data, seller: { name: sellerProfile?.name } }, ...products]);
      setIsAdding(false);
      setNewName('');
      setNewPrice('');
      setNewStock('');
    } else {
      alert('Failed to add product');
    }
  };

  if (loading) return <div className="loading">Loading inventory...</div>;

  return (
    <div className="inventory-section">
      <div className="inventory-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Product Inventory</h2>
        <button className="btn btn--primary" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddProduct} className="add-product-form" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
          <input type="text" placeholder="Product Name" value={newName} onChange={e => setNewName(e.target.value)} required style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }} />
          <input type="number" placeholder="Price (₹)" value={newPrice} onChange={e => setNewPrice(e.target.value)} required style={{ width: '100px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }} />
          <input type="number" placeholder="Stock" value={newStock} onChange={e => setNewStock(e.target.value)} required style={{ width: '100px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }} />
          <button type="submit" className="btn btn--success">Save</button>
        </form>
      )}

      <div className="inventory-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {products.map(product => (
          <div key={product.id} className="inventory-card" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="inventory-info" style={{ flex: 1 }}>
              <strong style={{ fontSize: '1.1rem' }}>{product.name}</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Seller: {product.seller?.name || 'Unknown'}</div>
            </div>
            <div className="inventory-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Price (₹)</label>
                <input 
                  type="number" 
                  defaultValue={product.price}
                  onBlur={(e) => handleUpdate(product.id, 'price', parseFloat(e.target.value))}
                  style={{ width: '80px', display: 'block', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Stock Unit</label>
                <input 
                  type="number" 
                  defaultValue={product.stock}
                  onBlur={(e) => handleUpdate(product.id, 'stock', parseInt(e.target.value, 10))}
                  style={{ width: '80px', display: 'block', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
