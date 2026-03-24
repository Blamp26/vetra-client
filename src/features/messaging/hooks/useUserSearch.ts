import { useState, useEffect, useCallback } from "react";
import { authApi } from "@/api/auth";
import { useAppStore, type RootState } from "@/store";

export function useUserSearch() {
  const [query, setQuery] = useState("");
  const currentUser      = useAppStore((s: RootState) => s.currentUser);
  const searchResults    = useAppStore((s: RootState) => s.searchResults);
  const setSearchResults = useAppStore((s: RootState) => s.setSearchResults);
  const isSearching      = useAppStore((s: RootState) => s.isSearching);
  const setIsSearching   = useAppStore((s: RootState) => s.setIsSearching);

  useEffect(() => {
    if (!query || query.length < 2 || !currentUser) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const users = await authApi.searchUsers(query);
        setSearchResults(users);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentUser, setSearchResults, setIsSearching]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setSearchResults([]);
  }, [setSearchResults]);

  return { 
    query, 
    setQuery, 
    searchResults, 
    isSearching, 
    clearSearch 
  };
}
