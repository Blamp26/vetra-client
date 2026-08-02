import { useCallback } from "react";
import { useAppStore, type RootState } from "@/store";
import { GroupProfileModal } from "../GroupProfileModal";
import { GroupSettingsModal } from "../GroupSettingsModal/GroupSettingsModal";

export function GroupManagementHost() {
  const surface = useAppStore((state: RootState) => state.groupSurface);
  const room = useAppStore((state: RootState) =>
    surface ? state.roomPreviews[surface.roomId] : undefined,
  );
  const openGroupSettings = useAppStore(
    (state: RootState) => state.openGroupSettings,
  );
  const backToGroupProfile = useAppStore(
    (state: RootState) => state.backToGroupProfile,
  );
  const closeGroupSurface = useAppStore(
    (state: RootState) => state.closeGroupSurface,
  );

  const close = useCallback(() => {
    const restoreFocus = surface?.restoreFocus;
    closeGroupSurface();
    window.setTimeout(() => {
      if (restoreFocus?.isConnected) restoreFocus.focus();
    }, 0);
  }, [closeGroupSurface, surface?.restoreFocus]);

  if (!surface || !room) return null;

  if (surface.view === "settings") {
    return (
      <GroupSettingsModal
        room={room}
        onClose={close}
        onBack={
          surface.settingsOrigin === "profile" ? backToGroupProfile : undefined
        }
      />
    );
  }

  return (
    <GroupProfileModal
      room={room}
      onClose={close}
      onSearchMessages={() => {
        closeGroupSurface();
        surface.onSearchMessages?.();
      }}
      onManage={() =>
        openGroupSettings(surface.roomId, {
          settingsOrigin: "profile",
          onSearchMessages: surface.onSearchMessages,
          restoreFocus: surface.restoreFocus,
        })
      }
    />
  );
}
