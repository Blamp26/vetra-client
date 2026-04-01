import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState } from "@/store";
import type { User, Server } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { Search, X } from "lucide-react";

export function UserSearch() {
  const { query, setQuery, searchResults, isSearching, clearSearch } = useUserSearch();
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);

  const handleSelectUser = (user: User) => {
    setActiveChat({ type: "direct", partnerId: user.id });
    clearSearch();
  };

  const handleSelectServer = (server: Server) => {
    setActiveChat({ type: "server", serverId: server.id });
    clearSearch();
  };

  const hasResults = searchResults.users.length > 0 || searchResults.servers.length > 0;

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        className="h-9 w-full bg-background border border-border pl-9 pr-8 text-sm outline-none focus:border-primary"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button 
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" 
          onClick={clearSearch}
        >
          <X className="h-4 w-4" />
        </button>
      )}
      
      {isSearching && (
        <div className="absolute left-0 right-0 top-full mt-1 px-3 py-2 text-xs text-muted-foreground bg-popover border border-border z-[110]">
          Searching...
        </div>
      )}
      
      {!isSearching && query && !hasResults && (
        <div className="absolute left-0 right-0 top-full mt-1 px-3 py-2 text-xs text-muted-foreground bg-popover border border-border z-[110]">
          No results for "{query}"
        </div>
      )}
      
      {hasResults && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border z-[110] max-h-[320px] overflow-y-auto p-1">
          {searchResults.users.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Users</div>
              <div className="space-y-0.5">
                {searchResults.users.map((user) => (
                  <button 
                    key={`user-${user.id}`}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-accent" 
                    onClick={() => handleSelectUser(user)}
                  >
                    <Avatar name={user.display_name || user.username} size="small" status={user.status} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-normal truncate">{user.display_name || user.username}</span>
                      {user.display_name && <span className="text-[10px] text-muted-foreground truncate">@{user.username}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.servers.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Servers</div>
              <div className="space-y-0.5">
                {searchResults.servers.map((server) => (
                  <button 
                    key={`server-${server.id}`}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-accent" 
                    onClick={() => handleSelectServer(server)}
                  >
                    <div className="w-6 h-6 border border-border bg-muted flex items-center justify-center shrink-0 text-[10px]">
                      #
                    </div>
                    <span className="text-xs font-normal truncate">{server.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
