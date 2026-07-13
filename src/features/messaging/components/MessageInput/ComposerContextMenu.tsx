import { createPortal } from "react-dom";
import type { KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";

export type ComposerMenuItem = {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action?: () => void;
  hasSubmenu?: boolean;
};

type Props = {
  left: number;
  top: number;
  submenuOnLeft: boolean;
  submenuOpen: boolean;
  activeMainIndex: number;
  activeSubmenuIndex: number;
  onOpenSubmenu: () => void;
  onMainActive: (index: number) => void;
  onSubmenuActive: (index: number) => void;
  onMainKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSubmenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  mainItems: ComposerMenuItem[];
  submenuItems: ComposerMenuItem[];
};

function MenuRow({ item, active, onMouseEnter }: { item: ComposerMenuItem; active: boolean; onMouseEnter: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      className={`vt-composer-menu__row${active ? " is-active" : ""}`}
      onMouseEnter={onMouseEnter}
      onClick={() => item.action?.()}
    >
      <span className="vt-composer-menu__label">{item.label}</span>
      {item.shortcut && <span className="vt-composer-menu__shortcut">{item.shortcut}</span>}
      {item.hasSubmenu && <ChevronRight className="vt-composer-menu__chevron" aria-hidden="true" />}
    </button>
  );
}

function MenuSeparator() {
  return <div className="vt-composer-menu__separator" role="separator" />;
}

export function ComposerContextMenu({
  left,
  top,
  submenuOnLeft,
  submenuOpen,
  activeMainIndex,
  activeSubmenuIndex,
  onOpenSubmenu,
  onMainActive,
  onSubmenuActive,
  onMainKeyDown,
  onSubmenuKeyDown,
  mainItems,
  submenuItems,
}: Props) {
  const main = (
    <div
      className="vt-composer-menu vt-composer-menu--main"
      style={{ left, top }}
      role="menu"
      tabIndex={-1}
      data-testid="composer-context-menu"
      onKeyDown={onMainKeyDown}
    >
      <MenuRow item={mainItems[0]} active={activeMainIndex === 0} onMouseEnter={() => onMainActive(0)} />
      <MenuRow item={mainItems[1]} active={activeMainIndex === 1} onMouseEnter={() => onMainActive(1)} />
      <MenuSeparator />
      <MenuRow item={mainItems[2]} active={activeMainIndex === 2} onMouseEnter={() => onMainActive(2)} />
      <MenuRow item={mainItems[3]} active={activeMainIndex === 3} onMouseEnter={() => onMainActive(3)} />
      <MenuRow item={mainItems[4]} active={activeMainIndex === 4} onMouseEnter={() => onMainActive(4)} />
      <MenuRow item={mainItems[5]} active={activeMainIndex === 5} onMouseEnter={() => onMainActive(5)} />
      <MenuSeparator />
      <MenuRow item={mainItems[6]} active={activeMainIndex === 6} onMouseEnter={() => { onMainActive(6); onOpenSubmenu(); }} />
      <MenuSeparator />
      <MenuRow item={mainItems[7]} active={activeMainIndex === 7} onMouseEnter={() => onMainActive(7)} />
    </div>
  );

  const submenu = submenuOpen ? (
    <div
      className="vt-composer-menu vt-composer-menu--submenu"
      style={{ left: submenuOnLeft ? left - 209 : left + 156, top: top + 5 }}
      role="menu"
      tabIndex={-1}
      data-testid="composer-formatting-submenu"
      onKeyDown={onSubmenuKeyDown}
    >
      {submenuItems.slice(0, 9).map((item, index) => (
        <MenuRow key={item.label} item={item} active={activeSubmenuIndex === index} onMouseEnter={() => onSubmenuActive(index)} />
      ))}
      <MenuSeparator />
      <MenuRow item={submenuItems[9]} active={activeSubmenuIndex === 9} onMouseEnter={() => onSubmenuActive(9)} />
    </div>
  ) : null;

  return createPortal(<>{main}{submenu}</>, document.body);
}
