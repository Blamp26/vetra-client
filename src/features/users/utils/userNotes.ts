import { storage } from "@/shared/utils/storage";

const USER_NOTES_KEY = "vetra_user_notes";
export type UserNotes = Record<string, string>;

export function getUserNotes(): UserNotes {
  return storage.get<UserNotes>(USER_NOTES_KEY) ?? {};
}

export function saveUserNote(userKey: string, note: string): UserNotes {
  const notes = getUserNotes();
  if (note.trim()) notes[userKey] = note.slice(0, 500);
  else delete notes[userKey];
  storage.set(USER_NOTES_KEY, notes);
  return notes;
}
