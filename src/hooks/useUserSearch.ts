import { useState, useEffect, useRef } from "react";
import { authApi } from "@/api/auth";
import { useAppStore } from "@/store";

const DEBOUNCE_MS = 300;

export function useUserSearch() {
  const [query, setQuery] = useState("");
  const currentUser = useAppStore((s) => s.currentUser);
  const setSearchResults = useAppStore((s) => s.setSearchResults);
  const setIsSearching = useAppStore((s) => s.setIsSearching);
  const searchResults = useAppStore((s) => s.searchResults);
  const isSearching = useAppStore((s) => s.isSearching);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await authApi.searchUsers(query);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, currentUser, setSearchResults, setIsSearching]);

  const clearSearch = () => { setQuery(""); setSearchResults([]); };
  return { query, setQuery, searchResults, isSearching, clearSearch };
}
