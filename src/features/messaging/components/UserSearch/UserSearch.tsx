import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState } from "@/store";
import type { User, Server } from "@/shared/types";
import { Avatar } from "@/shared/components/Avatar";
import { Hash } from "lucide-react";

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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lucide lucide-search absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      >
        <path d="m21 21-4.34-4.34"></path>
        <circle cx="11" cy="11" r="8"></circle>
      </svg>
      <input
        data-slot="input"
        className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-sidebar-accent border-0 pl-9 focus-visible:ring-1"
        placeholder="Search conversations..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button 
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" 
          onClick={clearSearch}
        >
          ×
        </button>
      )}
      
      {isSearching && (
        <div className="absolute left-0 right-0 top-full mt-1 px-3 py-2 text-xs text-muted-foreground bg-popover border border-border rounded-md shadow-md z-[110]">
          Searching…
        </div>
      )}
      
      {!isSearching && query && !hasResults && (
        <div className="absolute left-0 right-0 top-full mt-1 px-3 py-2 text-xs text-muted-foreground bg-popover border border-border rounded-md shadow-md z-[110]">
          No results found for "{query}"
        </div>
      )}
      
      {hasResults && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md z-[110] max-h-[320px] overflow-y-auto p-1">
          {searchResults.users.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Users</div>
              <ul className="list-none p-0 m-0">
                {searchResults.users.map((user) => (
                  <li key={`user-${user.id}`}>
                    <button 
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-sm text-left hover:bg-sidebar-accent transition-colors" 
                      onClick={() => handleSelectUser(user)}
                    >
                      <Avatar name={user.display_name || user.username} size="small" status={user.status} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">{user.display_name || user.username}</span>
                        {user.display_name && <span className="text-[10px] text-muted-foreground truncate">@{user.username}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {searchResults.servers.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Servers</div>
              <ul className="list-none p-0 m-0">
                {searchResults.servers.map((server) => (
                  <li key={`server-${server.id}`}>
                    <button 
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-sm text-left hover:bg-sidebar-accent transition-colors" 
                      onClick={() => handleSelectServer(server)}
                    >
                      <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium truncate">{server.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
