import React from 'react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDanger?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  isLoading = false,
  isDanger = true,
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div 
        className="modal-card" 
        style={{ width: 400, padding: '24px' }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>
        
        <div className="modal-body" style={{ marginBottom: '24px' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message}</p>
        </div>
        
        <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button 
            className="btn-secondary" 
            onClick={onCancel}
            disabled={isLoading}
            style={{ margin: 0 }}
          >
            {cancelLabel}
          </button>
          <button 
            className="btn-primary" 
            onClick={onConfirm}
            disabled={isLoading}
            style={{ 
              margin: 0,
              backgroundColor: isDanger ? 'var(--error)' : 'var(--accent)',
              borderColor: isDanger ? 'var(--error)' : 'var(--accent)',
            }}
          >
            {isLoading ? 'Загрузка...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
