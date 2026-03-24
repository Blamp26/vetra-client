interface Props {
  onPickServer: () => void;
  onPickGroup: () => void;
  onClose: () => void;
}

export function CreatePickerModal({ onPickServer, onPickGroup, onClose }: Props) {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-header">
          <h3>Create</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div style={{ display: "grid", gap: 12 }}>
            <button
              className="btn-secondary"
              style={{
                margin: 0,
                textAlign: "left",
                padding: "14px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
              onClick={onPickServer}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Create server</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                A community space with channels.
              </div>
            </button>

            <button
              className="btn-secondary"
              style={{
                margin: 0,
                textAlign: "left",
                padding: "14px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
              onClick={onPickGroup}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Create group</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                A direct conversation cluster.
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

