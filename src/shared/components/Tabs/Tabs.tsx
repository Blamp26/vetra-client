import React, { createContext, useContext, useId, useMemo, useRef } from "react";
import { cn } from "@/shared/utils/cn";

export type TabsOrientation = "horizontal" | "vertical";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  orientation: TabsOrientation;
  getTabId: (value: string) => string;
  getPanelId: (value: string) => string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used inside Tabs");
  return context;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  orientation?: TabsOrientation;
  baseId?: string;
}

export function Tabs({ value, onValueChange, orientation = "horizontal", baseId, className, children, ...props }: TabsProps) {
  const generatedId = useId();
  const idPrefix = (baseId ?? `vt-tabs-${generatedId}`).replace(/[^a-zA-Z0-9_-]/g, "-");
  const valueKeys = useRef(new Map<string, number>());
  const nextKey = useRef(0);

  const getValueKey = (tabValue: string) => {
    const existing = valueKeys.current.get(tabValue);
    if (existing !== undefined) return existing;
    const next = nextKey.current++;
    valueKeys.current.set(tabValue, next);
    return next;
  };

  const context = useMemo<TabsContextValue>(() => ({
    value,
    onValueChange,
    orientation,
    getTabId: (tabValue) => `${idPrefix}-tab-${getValueKey(tabValue)}`,
    getPanelId: (tabValue) => `${idPrefix}-panel-${getValueKey(tabValue)}`,
  }), [idPrefix, onValueChange, orientation, value]);

  return (
    <TabsContext.Provider value={context}>
      <div {...props} className={cn(className)} data-orientation={orientation}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TabList = React.forwardRef<HTMLDivElement, TabListProps>(function TabList(
  { className, onKeyDown, ...props },
  ref,
) {
  const { orientation, onValueChange } = useTabsContext();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>('[role="tab"]')
      : null;
    if (!target || !event.currentTarget.contains(target)) return;

    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .filter((tab) => !tab.disabled);
    const currentIndex = tabs.indexOf(target);
    if (currentIndex < 0) return;

    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    let destinationIndex: number | null = null;
    if (event.key === previousKey) destinationIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === nextKey) destinationIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "Home") destinationIndex = 0;
    if (event.key === "End") destinationIndex = tabs.length - 1;
    if (destinationIndex === null || tabs.length === 0) return;

    event.preventDefault();
    const destination = tabs[destinationIndex];
    destination.focus();
    const destinationValue = destination.dataset.tabValue;
    if (destinationValue) onValueChange(destinationValue);
  };

  return (
    <div
      {...props}
      ref={ref}
      role="tablist"
      aria-orientation={orientation}
      className={cn(className)}
      onKeyDown={handleKeyDown}
    />
  );
});

export interface TabProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "aria-selected" | "aria-controls"> {
  value: string;
}

export const Tab = React.forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { value, className, onClick, disabled = false, children, ...props },
  ref,
) {
  const context = useTabsContext();
  const selected = context.value === value;
  const tabId = context.getTabId(value);
  const panelId = context.getPanelId(value);

  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role="tab"
      id={tabId}
      data-tab-value={value}
      data-state={selected ? "active" : "inactive"}
      data-orientation={context.orientation}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) context.onValueChange(value);
      }}
    >
      {children}
    </button>
  );
});

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabPanel = React.forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { value, className, children, ...props },
  ref,
) {
  const context = useTabsContext();
  const active = context.value === value;

  return (
    <div
      {...props}
      ref={ref}
      id={context.getPanelId(value)}
      role="tabpanel"
      aria-labelledby={context.getTabId(value)}
      hidden={!active}
      data-state={active ? "active" : "inactive"}
      className={cn(className)}
    >
      {active ? children : null}
    </div>
  );
});
