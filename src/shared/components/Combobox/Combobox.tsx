import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { cn } from "@/shared/utils/cn";

interface RegisteredOption {
  id: string;
  value: string;
  disabled: MutableRefObject<boolean>;
  element: MutableRefObject<HTMLButtonElement | null>;
  onSelect: MutableRefObject<(() => void) | undefined>;
}

interface ComboboxContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeValue?: string;
  onActiveValueChange?: (value: string | undefined) => void;
  loop: boolean;
  inputId: string;
  listId: string;
  registerOption: (option: RegisteredOption) => () => void;
  options: RegisteredOption[];
  close: () => void;
  select: (value: string) => void;
  setActive: (value: string | undefined) => void;
  getEnabledOptions: () => RegisteredOption[];
  getActiveOption: () => RegisteredOption | undefined;
}

const ComboboxContext = createContext<ComboboxContextValue | null>(null);

function useComboboxContext() {
  const context = useContext(ComboboxContext);
  if (!context) throw new Error("Combobox components must be used inside Combobox");
  return context;
}

function useMergedRef<T>(...refs: Array<ForwardedRef<T> | MutableRefObject<T | null> | undefined>) {
  return useCallback((value: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(value);
      else if (ref) ref.current = value;
    });
  }, refs);
}

export interface ComboboxProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeValue?: string;
  onActiveValueChange?: (value: string | undefined) => void;
  loop?: boolean;
  autoFocus?: boolean;
  children: ReactNode;
}

export const Combobox = forwardRef<HTMLDivElement, ComboboxProps>(function Combobox(
  {
    open,
    onOpenChange,
    activeValue,
    onActiveValueChange,
    loop = true,
    autoFocus = false,
    className,
    children,
    ...props
  },
  forwardedRef,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [options, setOptions] = useState<RegisteredOption[]>([]);
  const id = useId().replace(/:/g, "");
  const inputId = `vt-combobox-${id}-input`;
  const listId = `vt-combobox-${id}-list`;

  const setActive = useCallback((value: string | undefined) => {
    onActiveValueChange?.(value);
  }, [onActiveValueChange]);

  const getEnabledOptions = useCallback(
    () => options.filter((option) => !option.disabled.current && option.element.current),
    [options],
  );

  const getActiveOption = useCallback(
    () => options.find((option) => option.value === activeValue && !option.disabled.current && option.element.current),
    [activeValue, options],
  );

  const close = useCallback(() => {
    onOpenChange(false);
    setActive(undefined);
  }, [onOpenChange, setActive]);

  const select = useCallback((value: string) => {
    const option = options.find((candidate) => candidate.value === value);
    if (!option || option.disabled.current) return;
    option.onSelect.current?.();
    close();
  }, [close, options]);

  const registerOption = useCallback((option: RegisteredOption) => {
    setOptions((current) => {
      if (current.some((candidate) => candidate.value === option.value)) {
        if (import.meta.env?.DEV) {
          console.warn(`Combobox option values must be unique: ${option.value}`);
        }
      }
      return [...current, option];
    });
    return () => setOptions((current) => current.filter((candidate) => candidate.id !== option.id));
  }, []);

  useEffect(() => {
    if (activeValue && options.length > 0 && !getActiveOption()) setActive(undefined);
  }, [activeValue, getActiveOption, options.length, setActive]);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const enabled = getEnabledOptions();
    const active = getActiveOption();
    if (active) {
      active.element.current?.focus();
    } else if (enabled[0]) {
      setActive(enabled[0].value);
      enabled[0].element.current?.focus();
    } else {
      rootRef.current?.focus();
    }
  }, [autoFocus, getActiveOption, getEnabledOptions, open, setActive]);

  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) => target instanceof Node && rootRef.current?.contains(target);
    const handlePointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) close();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!isInside(event.target)) close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [close, open]);

  const context = useMemo<ComboboxContextValue>(() => ({
    open,
    onOpenChange,
    activeValue,
    onActiveValueChange,
    loop,
    inputId,
    listId,
    registerOption,
    options,
    close,
    select,
    setActive,
    getEnabledOptions,
    getActiveOption,
  }), [activeValue, close, getActiveOption, getEnabledOptions, inputId, listId, loop, onActiveValueChange, onOpenChange, open, options, registerOption, select, setActive]);

  const setRootRef = useMergedRef(forwardedRef, rootRef);

  return (
    <ComboboxContext.Provider value={context}>
      <div {...props} ref={setRootRef} tabIndex={props.tabIndex ?? -1} className={cn(className)}>
        {children}
      </div>
    </ComboboxContext.Provider>
  );
});

export interface ComboboxInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const ComboboxInput = forwardRef<HTMLInputElement, ComboboxInputProps>(function ComboboxInput(
  { onKeyDown, onFocus, ...props },
  forwardedRef,
) {
  const context = useComboboxContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useMergedRef(forwardedRef, inputRef);

  const move = (direction: 1 | -1, edge?: "first" | "last") => {
    const enabled = context.getEnabledOptions();
    if (enabled.length === 0) return false;
    const currentIndex = enabled.findIndex((option) => option.value === context.activeValue);
    let nextIndex: number;
    if (edge === "first") nextIndex = 0;
    else if (edge === "last") nextIndex = enabled.length - 1;
    else if (currentIndex === -1) nextIndex = direction === 1 ? 0 : enabled.length - 1;
    else {
      nextIndex = currentIndex + direction;
      if (context.loop) nextIndex = (nextIndex + enabled.length) % enabled.length;
      else nextIndex = Math.max(0, Math.min(enabled.length - 1, nextIndex));
    }
    const option = enabled[nextIndex];
    context.setActive(option.value);
    context.onOpenChange(true);
    option.element.current?.focus();
    inputRef.current?.focus();
    return true;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown") {
      if (move(1)) event.preventDefault();
    } else if (event.key === "ArrowUp") {
      if (move(-1)) event.preventDefault();
    } else if (event.key === "Home" && context.open) {
      if (move(1, "first")) event.preventDefault();
    } else if (event.key === "End" && context.open) {
      if (move(-1, "last")) event.preventDefault();
    } else if ((event.key === "Enter" || event.key === " " || event.key === "Spacebar") && context.open && context.getActiveOption()) {
      event.preventDefault();
      context.select(context.activeValue!);
    } else if (event.key === "Escape" && context.open) {
      event.preventDefault();
      event.stopPropagation();
      context.close();
    } else if (event.key === "Tab" && context.open) {
      context.close();
    }
  };

  return (
    <input
      {...props}
      ref={setInputRef}
      id={props.id ?? context.inputId}
      role="combobox"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded={context.open}
      aria-controls={context.listId}
      aria-activedescendant={context.open ? context.getActiveOption()?.id : undefined}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
    />
  );
});

export interface ComboboxListProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ComboboxList = forwardRef<HTMLDivElement, ComboboxListProps>(function ComboboxList(
  { className, children, ...props },
  forwardedRef,
) {
  const context = useComboboxContext();
  return (
    <div
      {...props}
      ref={forwardedRef}
      id={props.id ?? context.listId}
      role="listbox"
      hidden={!context.open}
      aria-hidden={!context.open ? "true" : undefined}
      className={cn(className)}
    >
      {children}
    </div>
  );
});

interface GroupContextValue { labelId: string }
const GroupContext = createContext<GroupContextValue | null>(null);

export interface ComboboxGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ComboboxGroup = forwardRef<HTMLDivElement, ComboboxGroupProps>(function ComboboxGroup(
  { className, children, "aria-labelledby": labelledBy, ...props },
  forwardedRef,
) {
  const id = useId().replace(/:/g, "");
  const labelId = `vt-combobox-${id}-label`;
  return (
    <GroupContext.Provider value={{ labelId }}>
      <div {...props} ref={forwardedRef} role="group" aria-labelledby={labelledBy ?? labelId} className={cn(className)}>
        {children}
      </div>
    </GroupContext.Provider>
  );
});

export interface ComboboxGroupLabelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ComboboxGroupLabel = forwardRef<HTMLDivElement, ComboboxGroupLabelProps>(function ComboboxGroupLabel(
  { className, ...props },
  forwardedRef,
) {
  const group = useContext(GroupContext);
  const id = props.id ?? group?.labelId;
  return <div {...props} ref={forwardedRef} id={id} className={cn(className)} />;
});

export interface ComboboxOptionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onSelect"> {
  value: string;
  onSelect?: () => void;
}

export const ComboboxOption = forwardRef<HTMLButtonElement, ComboboxOptionProps>(function ComboboxOption(
  { value, onSelect, disabled = false, className, children, onMouseEnter, onFocus, onPointerDown, onClick, ...props },
  forwardedRef,
) {
  const context = useComboboxContext();
  const id = useId().replace(/:/g, "");
  const optionRef = useRef<HTMLButtonElement | null>(null);
  const disabledRef = useRef(disabled);
  const onSelectRef = useRef(onSelect);
  disabledRef.current = disabled;
  onSelectRef.current = onSelect;
  const setOptionRef = useMergedRef(forwardedRef, optionRef);
  const active = context.activeValue === value;

  useEffect(() => context.registerOption({ id, value, disabled: disabledRef, element: optionRef, onSelect: onSelectRef }), [context.registerOption, id, value]);

  const activate = () => {
    if (!disabled) context.select(value);
  };

  return (
    <button
      {...props}
      ref={setOptionRef}
      id={id}
      type="button"
      role="option"
      disabled={disabled}
      tabIndex={active && !disabled ? 0 : -1}
      aria-selected={active}
      data-highlighted={active ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      onMouseEnter={(event) => { if (!disabled) context.setActive(value); onMouseEnter?.(event); }}
      onFocus={(event) => { if (!disabled) context.setActive(value); onFocus?.(event); }}
      onPointerDown={(event) => { event.preventDefault(); onPointerDown?.(event); }}
      onClick={(event) => { activate(); onClick?.(event); }}
      className={cn(className)}
    >
      {children}
    </button>
  );
});
