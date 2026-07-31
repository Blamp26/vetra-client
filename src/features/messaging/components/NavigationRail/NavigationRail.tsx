import { useEffect, useMemo, useRef } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { useAppStore, type RootState } from "@/store";
import { serversApi } from "@/api/servers";
import { Avatar } from "@/shared/components/Avatar";
import { formatUnreadCount } from "../../utils/unread";
import { cn } from "@/shared/utils/cn";

export function NavigationRail() {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const servers = useAppStore((s: RootState) => s.servers);
  const setServers = useAppStore((s: RootState) => s.setServers);
  const serverChannels = useAppStore((s: RootState) => s.serverChannels);
  const channelUnread = useAppStore((s: RootState) => s.channelUnread);
  const conversationPreviews = useAppStore(
    (s: RootState) => s.conversationPreviews,
  );
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  const railContext = useAppStore((s: RootState) => s.railContext) ?? {
    type: "conversations" as const,
  };
  const selectConversations = useAppStore(
    (s: RootState) => s.selectConversations,
  );
  const selectServer = useAppStore((s: RootState) => s.selectServer);
  const openModal = useAppStore((s: RootState) => s.openModal);
  const createRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    serversApi
      .getList()
      .then((items) => setServers?.(items))
      .catch((err) => console.error("Failed to load servers:", err));
  }, [currentUser, setServers]);

  const serverList = useMemo(() => Object.values(servers), [servers]);
  const conversationUnread =
    Object.values(conversationPreviews).reduce(
      (sum, item) => sum + (item.unread_count ?? 0),
      0,
    ) +
    Object.values(roomPreviews)
      .filter((room) => room.server_id == null)
      .reduce((sum, item) => sum + (item.unread_count ?? 0), 0);
  const unreadForServer = (serverId: number) =>
    (serverChannels[serverId] ?? []).reduce(
      (sum, channel) =>
        sum + (channel.unread_count ?? channelUnread[channel.id] ?? 0),
      0,
    );
  const moveFocus = (index: number) => {
    const controls = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "[data-navigation-rail-item]",
      ),
    );
    controls[(index + controls.length) % controls.length]?.focus();
  };

  return (
    <nav
      aria-label="Permanent navigation"
      className="flex h-full w-[72px] flex-shrink-0 flex-col items-center border-r border-border bg-[var(--vetra-shell-sidebar-bg)] py-3"
    >
      <button
        type="button"
        data-navigation-rail-item
        aria-label="Conversations"
        title="Conversations"
        aria-pressed={railContext.type === "conversations"}
        data-state={
          railContext.type === "conversations" ? "active" : "inactive"
        }
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-xl",
          railContext.type === "conversations"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
        onClick={selectConversations}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveFocus(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            createRef.current?.focus();
          }
        }}
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        {conversationUnread > 0 && (
          <span
            aria-label={`${conversationUnread} unread conversations`}
            className="absolute right-0 top-0 flex min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground"
          >
            {formatUnreadCount(conversationUnread)}
          </span>
        )}
      </button>
      <div
        className="mt-3 flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-2"
        aria-label="Servers"
      >
        {serverList.map((server, index) => {
          const unread = unreadForServer(server.id);
          const active =
            railContext.type === "server" && railContext.serverId === server.id;
          return (
            <button
              key={server.id}
              type="button"
              data-navigation-rail-item
              data-testid={`navigation-rail-server-${server.id}`}
              aria-label={server.name}
              title={server.name}
              aria-pressed={active}
              data-state={active ? "active" : "inactive"}
              className={cn(
                "relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl",
                active ? "bg-accent" : "hover:bg-muted",
              )}
              onClick={() => selectServer(server.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveFocus(index + 2);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveFocus(index);
                }
              }}
            >
              <Avatar name={server.name} size="medium" />
              {unread > 0 && (
                <span
                  aria-label={`${unread} unread messages in ${server.name}`}
                  className="absolute right-0 top-0 flex min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground"
                >
                  {formatUnreadCount(unread)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        ref={createRef}
        type="button"
        data-navigation-rail-item
        aria-label="Create server"
        title="Create server"
        className="mt-3 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground hover:bg-muted"
        onClick={() => openModal("CREATE_SERVER")}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveFocus(serverList.length);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveFocus(0);
          }
        }}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </nav>
  );
}
