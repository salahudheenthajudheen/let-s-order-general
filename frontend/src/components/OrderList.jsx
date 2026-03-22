import React from 'react';
import OrderCard from './OrderCard';

export default function OrderList({ orders, onAccept, onReject, onDispatch, onDelivered, loading }) {
  if (loading) {
    return (
      <div className="order-list__empty">
        <div className="spinner" />
        <p>Loading orders...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="order-list__empty">
        <span className="order-list__empty-icon">📭</span>
        <h3>No orders yet</h3>
        <p>New orders from Telegram will appear here in real-time.</p>
      </div>
    );
  }

  return (
    <div className="order-list">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onAccept={onAccept}
          onReject={onReject}
          onDispatch={onDispatch}
          onDelivered={onDelivered}
        />
      ))}
    </div>
  );
}
