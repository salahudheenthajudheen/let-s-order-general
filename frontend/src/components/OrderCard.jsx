import React from 'react';
import StatusBadge from './StatusBadge';

export default function OrderCard({ order, onAccept, onReject, onDispatch }) {
  const createdAt = new Date(order.created_at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`order-card ${order.status === 'pending' ? 'order-card--new' : ''}`}>
      <div className="order-card__header">
        <div className="order-card__id">#{order.id.slice(0, 8)}</div>
        <StatusBadge status={order.status} />
      </div>

      <div className="order-card__body">
        <div className="order-card__product">
          <span className="order-card__emoji">📦</span>
          <div>
            <h3>{order.product}</h3>
            <p>Qty: {order.quantity}</p>
          </div>
        </div>

        <div className="order-card__meta">
          <div className="order-card__meta-item">
            <span className="meta-label">Customer</span>
            <span className="meta-value">{order.customer?.name || 'Unknown'}</span>
          </div>
          <div className="order-card__meta-item">
            <span className="meta-label">Seller</span>
            <span className="meta-value">{order.seller?.name || 'N/A'}</span>
          </div>
          <div className="order-card__meta-item">
            <span className="meta-label">Ordered</span>
            <span className="meta-value">{createdAt}</span>
          </div>
        </div>
      </div>

      {order.status === 'pending' && (
        <div className="order-card__actions">
          <button className="btn btn--accept" onClick={() => onAccept(order.id)}>
            ✅ Accept
          </button>
          <button className="btn btn--reject" onClick={() => onReject(order.id)}>
            ❌ Reject
          </button>
        </div>
      )}

      {order.status === 'accepted' && (
        <div className="order-card__actions">
          <button className="btn btn--dispatch" onClick={() => onDispatch(order.id)}>
            🚚 Mark Dispatched
          </button>
        </div>
      )}

      {order.payment_link && (
        <div className="order-card__payment">
          <a href={order.payment_link} target="_blank" rel="noreferrer">
            💳 Payment Link
          </a>
        </div>
      )}
    </div>
  );
}
