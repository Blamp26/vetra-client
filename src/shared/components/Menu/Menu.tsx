import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { cn } from "@/shared/utils/cn";

interface MenuRegistration {
  value: string;
  ref: React.RefObject<HTMLButtonElement | null>;
  isDisabled: () => boolean;
  select: () => void;
}

interface MenuContextValue {
  activeValue: string | undefined;
  onActiveValueChange: (value: string) => void;
  register: (item: MenuRegistration) => () => void;
  activate: (value: string) => void;
  getItems: () => MenuRegistration[];
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) throw new Error("Menu components must be used inside Menu");
  return context;
}

export interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  activeValue?: string;
  onActiveValueChange?: (value: string) => void;
  onEscape?: () => void;
  onArrowRight?: () => void;
  onArrowLeft?: () => void;
  autoFocus?: boolean;
  loop?: boolean;
}

export const Menu = React.forwardRef<HTMLDivElement, MenuProps>(function Menu(
  {
    activeValue,
    onActiveValueChange,
    onEscape,
    onArrowRight,
    onArrowLeft,
    autoFocus = false,
    loop = true,
    className,
    children,
    onKeyDown,
    ...props
  },
  ref,
) {
  const menuRef = useRef<HTMLDivElement | null>(null) as React.MutableRefObject<HTMLDivElement | null>;
  const registrationsRef = useRef<MenuRegistration[]>([]);
  const setActive = (value: string) => onActiveValueChange?.(value);

  const context = useMemo<MenuContextValue>(() => ({
    activeValue,
    onActiveValueChange: setActive,
    register: (item) => {
      const duplicate = registrationsRef.current.find((registered) => registered.value === item.value);
      if (duplicate && duplicate.ref !== item.ref && process.env.NODE_ENV !== "production") {
        console.warn(`Menu value "${item.value}" is registered more than once.`);
      }
      if (!duplicate) registrationsRef.current.push(item);
      else Object.assign(duplicate, item);
      return () => {
        registrationsRef.current = registrationsRef.current.filter((registered) => registered.ref !== item.ref);
      };
    },
    activate: (value) => {
      const item = registrationsRef.current.find((registered) => registered.value === value);
      if (!item || item.isDisabled()) return;
      item.select();
    },
    getItems: () => registrationsRef.current.filter((item) => item.ref.current?.isConnected !== false),
  }), [activeValue, onActiveValueChange]);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      const items = context.getItems().filter((item) => !item.isDisabled() && item.ref.current);
      const active = items.find((item) => item.value === activeValue) ?? items[0];
      if (active) {
        if (active.value !== activeValue) setActive(active.value);
        active.ref.current?.focus();
        return;
      }
      menuRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, activeValue, context]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>('[role="menuitem"]')
      : null;
    const items = context.getItems().filter((item) => !item.isDisabled() && item.ref.current);
    const currentIndex = target
      ? items.findIndex((item) => item.ref.current === target)
      : items.findIndex((item) => item.value === activeValue);

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape?.();
      return;
    }
    if (event.key === "ArrowRight" && onArrowRight) {
      event.preventDefault();
      onArrowRight();
      return;
    }
    if (event.key === "ArrowLeft" && onArrowLeft) {
      event.preventDefault();
      onArrowLeft();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (currentIndex < 0) return;
      event.preventDefault();
      context.activate(items[currentIndex].value);
      return;
    }

    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const destinationIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : direction === 0 || currentIndex < 0
          ? null
          : loop
            ? (currentIndex + direction + items.length) % items.length
            : Math.min(Math.max(currentIndex + direction, 0), items.length - 1);

    if (destinationIndex === null || items.length === 0) return;
    event.preventDefault();
    const destination = items[destinationIndex];
    setActive(destination.value);
    destination.ref.current?.focus();
  };

  return (
    <MenuContext.Provider value={context}>
      <div
        {...props}
        ref={(node) => {
          menuRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        role="menu"
        tabIndex={-1}
        className={cn(className)}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
});

export interface MenuItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "aria-disabled" | "aria-expanded" | "aria-controls"> {
  value: string;
  onSelect?: () => void;
  hasSubmenu?: boolean;
  expanded?: boolean;
  controls?: string;
}

export const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { value, onSelect, hasSubmenu = false, expanded, controls, disabled = false, className, children, onClick, onFocus, onMouseEnter, ...props },
  forwardedRef,
) {
  const context = useMenuContext();
  const itemRef = useRef<HTMLButtonElement | null>(null) as React.MutableRefObject<HTMLButtonElement | null>;
  const disabledRef = useRef(disabled);
  const onSelectRef = useRef(onSelect);
  disabledRef.current = disabled;
  onSelectRef.current = onSelect;

  useEffect(() => context.register({
    value,
    ref: itemRef,
    isDisabled: () => disabledRef.current,
    select: () => onSelectRef.current?.(),
  }), [context, value]);

  const setRef = (node: HTMLButtonElement | null) => {
    itemRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };
  const active = context.activeValue === value && !disabled;

  return (
    <button
      {...props}
      ref={setRef}
      type="button"
      role="menuitem"
      data-menu-value={value}
      data-highlighted={active ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      aria-haspopup={hasSubmenu ? "menu" : undefined}
      aria-expanded={hasSubmenu ? expanded : undefined}
      aria-controls={hasSubmenu ? controls : undefined}
      disabled={disabled}
      tabIndex={active ? 0 : -1}
      className={cn(className)}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!disabled) context.onActiveValueChange(value);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!disabled) context.onActiveValueChange(value);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) context.activate(value);
      }}
    >
      {children}
    </button>
  );
});

export interface MenuSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export function MenuSeparator({ className, ...props }: MenuSeparatorProps) {
  return <div {...props} role="separator" className={cn(className)} />;
}
