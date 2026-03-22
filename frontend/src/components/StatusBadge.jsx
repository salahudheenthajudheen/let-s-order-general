import React from 'react';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  accepted: { label: 'Accepted', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  rejected: { label: 'Rejected', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  dispatched: { label: 'Dispatched', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' },
  delivered: { label: 'Delivered', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      className="status-badge"
      style={{
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.color}30`,
      }}
    >
      <span className="status-dot" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}
