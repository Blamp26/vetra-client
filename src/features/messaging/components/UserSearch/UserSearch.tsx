import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState } from "@/store";
import type { User, Server } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { Search, X } from "lucide-react";
import { useState } from "react";
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
} from "@/shared/components/Combobox";
import {
  directChatForUser,
  serverChatForServer,
} from "@/shared/utils/chatRoutes";
import { resolvePresenceStatus } from "@/shared/utils/presence";

export function UserSearch() {
  const { query, setQuery, searchResults, isSearching, clearSearch } =
    useUserSearch();
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);
  const onlineUserIds = useAppStore((s: RootState) => s.onlineUserIds);
  const userStatuses = useAppStore((s: RootState) => s.userStatuses);
  const lastSeenAt = useAppStore((s: RootState) => s.lastSeenAt);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | undefined>();

  const handleSelectUser = (user: User) => {
    setActiveChat(directChatForUser(user));
    clearSearch();
    setOpen(false);
    setActiveValue(undefined);
  };

  const handleSelectServer = (server: Server) => {
    setActiveChat(serverChatForServer(server));
    clearSearch();
    setOpen(false);
    setActiveValue(undefined);
  };

  const hasResults =
    searchResults.users.length > 0 || searchResults.servers.length > 0;

  const handleClear = () => {
    clearSearch();
    setOpen(false);
    setActiveValue(undefined);
  };

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      activeValue={activeValue}
      onActiveValueChange={setActiveValue}
      className="relative"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <ComboboxInput
        aria-label="Search people or servers"
        className="vt-input h-11 pl-9 pr-10"
        placeholder="Search people or servers"
        value={query}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onChange={(e) => {
          const nextQuery = e.target.value;
          setQuery(nextQuery);
          setActiveValue(undefined);
          setOpen(Boolean(nextQuery.trim()));
        }}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={handleClear}
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <ComboboxList
        aria-label="Search results"
        className={hasResults
          ? "absolute left-0 right-0 top-full z-[110] mt-2 max-h-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-popover p-1.5 shadow-[var(--overlay-shadow)]"
          : "absolute left-0 right-0 top-full z-[110] mt-2 rounded-[var(--radius-md)] border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-[var(--overlay-shadow)]"}
      >
          {open && isSearching && <div role="status" aria-live="polite">Searching...</div>}
          {open && !isSearching && query && !hasResults && <div role="status" aria-live="polite">No results for "{query}"</div>}
          {searchResults.users.length > 0 && (
            <ComboboxGroup className="mb-2" aria-label="Users">
              <ComboboxGroupLabel className="vt-kicker px-2 py-1">
                Users
              </ComboboxGroupLabel>
              <div className="space-y-0.5">
                {searchResults.users.map((user) => (
                  <ComboboxOption
                    key={`user-${user.id}`}
                    value={`user:${user.id}`}
                    className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-accent"
                    onSelect={() => handleSelectUser(user)}
                  >
                    <Avatar
                      name={user.display_name || user.username}
                      size="small"
                      status={resolvePresenceStatus({
                        userId: user.id,
                        onlineUserIds,
                        userStatuses,
                        fallbackStatus: user.status,
                        lastSeenAt: lastSeenAt[user.id] ?? user.last_seen_at,
                      })}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-normal truncate">
                        {user.display_name || user.username}
                      </span>
                      {user.display_name && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          @{user.username}
                        </span>
                      )}
                    </div>
                  </ComboboxOption>
                ))}
              </div>
            </ComboboxGroup>
          )}

          {searchResults.servers.length > 0 && (
            <ComboboxGroup aria-label="Servers">
              <ComboboxGroupLabel className="vt-kicker px-2 py-1">
                Servers
              </ComboboxGroupLabel>
              <div className="space-y-0.5">
                {searchResults.servers.map((server) => (
                  <ComboboxOption
                    key={`server-${server.id}`}
                    value={`server:${server.id}`}
                    className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-accent"
                    onSelect={() => handleSelectServer(server)}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[10px]">
                      #
                    </div>
                    <span className="text-xs font-normal truncate">
                      {server.name}
                    </span>
                  </ComboboxOption>
                ))}
              </div>
            </ComboboxGroup>
          )}
        </ComboboxList>
    </Combobox>
  );
}
