import React from 'react';

export default function RoleSwitcher({ activeRole, onChangeRole }) {
  return (
    <div className="role-switcher" style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      background: 'var(--surface)',
      padding: '0.4rem 0.8rem',
      borderRadius: '20px',
      border: '1px solid var(--border)',
      marginLeft: '1rem'
    }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>VIEWING AS:</span>
      <select 
        value={activeRole} 
        onChange={(e) => onChangeRole(e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--primary)',
          fontWeight: 'bold',
          cursor: 'pointer',
          outline: 'none',
          fontSize: '0.9rem'
        }}
      >
        <option value="consumer">🛒 Consumer</option>
        <option value="seller">🏪 Seller</option>
        <option value="admin">🛡️ Admin</option>
      </select>
    </div>
  );
}
