import { createPortal } from "react-dom";
import { useId, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@/shared/components/Menu";

export type ComposerMenuItem = {
  value: string;
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
  activeMainValue?: string;
  activeSubmenuValue?: string;
  onOpenSubmenu: () => void;
  onMainActive: (value: string) => void;
  onSubmenuActive: (value: string) => void;
  onClose: () => void;
  onCloseSubmenu: () => void;
  mainItems: ComposerMenuItem[];
  submenuItems: ComposerMenuItem[];
};

export function ComposerContextMenu({
  left,
  top,
  submenuOnLeft,
  submenuOpen,
  activeMainValue,
  activeSubmenuValue,
  onOpenSubmenu,
  onMainActive,
  onSubmenuActive,
  onClose,
  onCloseSubmenu,
  mainItems,
  submenuItems,
}: Props) {
  const submenuId = `composer-formatting-${useId().replace(/:/g, "")}`;
  const formattingItemRef = useRef<HTMLButtonElement>(null);
  const renderItem = (item: ComposerMenuItem, submenu = false) => (
    <MenuItem
      key={item.value}
      ref={item.value === "formatting" ? formattingItemRef : undefined}
      value={item.value}
      disabled={item.disabled}
      hasSubmenu={item.hasSubmenu}
      expanded={item.value === "formatting" ? submenuOpen : undefined}
      controls={item.value === "formatting" ? submenuId : undefined}
      className="vt-composer-menu__row"
      onMouseEnter={() => {
        (submenu ? onSubmenuActive : onMainActive)(item.value);
        if (item.hasSubmenu) onOpenSubmenu();
      }}
      onSelect={item.hasSubmenu ? onOpenSubmenu : item.action}
    >
      <span className="vt-composer-menu__label">{item.label}</span>
      {item.shortcut && <span className="vt-composer-menu__shortcut">{item.shortcut}</span>}
      {item.hasSubmenu && <ChevronRight className="vt-composer-menu__chevron" aria-hidden="true" />}
    </MenuItem>
  );

  const main = (
    <Menu
      className="vt-composer-menu vt-composer-menu--main"
      style={{ left, top }}
      data-testid="composer-context-menu"
      activeValue={activeMainValue}
      onActiveValueChange={onMainActive}
      onEscape={onClose}
      onArrowRight={activeMainValue === "formatting" ? onOpenSubmenu : undefined}
      autoFocus={!submenuOpen}
    >
      {renderItem(mainItems[0])}
      {renderItem(mainItems[1])}
      <MenuSeparator className="vt-composer-menu__separator" />
      {renderItem(mainItems[2])}
      {renderItem(mainItems[3])}
      {renderItem(mainItems[4])}
      {renderItem(mainItems[5])}
      <MenuSeparator className="vt-composer-menu__separator" />
      {renderItem(mainItems[6])}
      <MenuSeparator className="vt-composer-menu__separator" />
      {renderItem(mainItems[7])}
    </Menu>
  );

  const submenu = submenuOpen ? (
    <Menu
      className="vt-composer-menu vt-composer-menu--submenu"
      style={{ left: submenuOnLeft ? left - 209 : left + 156, top: top + 5 }}
      id={submenuId}
      data-testid="composer-formatting-submenu"
      activeValue={activeSubmenuValue}
      onActiveValueChange={onSubmenuActive}
      onEscape={onClose}
      onArrowLeft={onCloseSubmenu}
      autoFocus
    >
      {submenuItems.slice(0, 9).map((item) => renderItem(item, true))}
      <MenuSeparator className="vt-composer-menu__separator" />
      {renderItem(submenuItems[9], true)}
    </Menu>
  ) : null;

  return createPortal(<>{main}{submenu}</>, document.body);
}
