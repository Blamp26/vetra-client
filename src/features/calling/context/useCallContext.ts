import { useContext } from "react";
import { CallContext } from "./CallProvider";

export function useCallContext() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCallContext must be used within a CallProvider");
  }

  return context;
}
