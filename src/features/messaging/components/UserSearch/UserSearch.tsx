import { useUserSearch } from "@/features/messaging/hooks/useUserSearch";
import { useAppStore, type RootState } from "@/store";
import type { User } from "@/shared/types";

export function UserSearch() {
  const { query, setQuery, searchResults, isSearching, clearSearch } = useUserSearch();
  const setActiveChat = useAppStore((s: RootState) => s.setActiveChat);

  const handleSelectUser = (user: User) => {
    setActiveChat({ type: "direct", partnerId: user.id });
    clearSearch();
  };

  return (
    <div className="user-search">
      <div className="search-input-wrapper">
        <input
          type="text" className="search-input" placeholder="🔍 Find users…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button className="search-clear" onClick={clearSearch}>×</button>}
      </div>
      {isSearching && <div className="search-status">Searching…</div>}
      {!isSearching && query && searchResults.length === 0 && (
        <div className="search-status">No users found for "{query}"</div>
      )}
      {searchResults.length > 0 && (
        <ul className="search-results">
          {searchResults.map((user) => (
            <li key={user.id}>
              <button className="search-result-item" onClick={() => handleSelectUser(user)}>
                <span className="avatar">{(user.display_name || user.username)[0].toUpperCase()}</span>
                <span className="nickname">{user.display_name || user.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
