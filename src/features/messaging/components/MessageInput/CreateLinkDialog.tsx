import { createPortal } from "react-dom";

type Props = {
  selectedText: string;
  url: string;
  invalid: boolean;
  allowEmpty: boolean;
  onUrlChange: (url: string) => void;
  onCancel: () => void;
  onCreate: () => void;
};

export function CreateLinkDialog({ selectedText, url, invalid, allowEmpty, onUrlChange, onCancel, onCreate }: Props) {
  return createPortal(
    <div className="vt-create-link-layer" data-testid="create-link-layer">
      <button type="button" className="vt-create-link-backdrop" aria-hidden="true" tabIndex={-1} onClick={onCancel} />
      <div className="vt-create-link-dialog" role="dialog" aria-modal="true" aria-labelledby="create-link-title" data-testid="create-link-dialog">
        <h2 id="create-link-title">Create link</h2>
        <div className="vt-create-link-label">Text</div>
        <div className="vt-create-link-selected-text" title={selectedText}>{selectedText}</div>
        <div className="vt-create-link-divider" />
        <div className="vt-create-link-url-label">URL</div>
        <input
          autoFocus
          value={url}
          aria-label="URL"
          aria-invalid={invalid}
          className={`vt-create-link-url-input${invalid ? " is-invalid" : ""}`}
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); onCreate(); }
            if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          }}
          data-testid="create-link-url-input"
        />
        <div className={`vt-create-link-url-underline${invalid ? " is-invalid" : ""}`} />
        {invalid && <div className="vt-create-link-error" role="status">Enter a valid HTTP or HTTPS URL.</div>}
        <div className="vt-create-link-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onCreate} disabled={invalid || (!allowEmpty && url.trim().length === 0)}>Create</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
