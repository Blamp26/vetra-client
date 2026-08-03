export const ADMIN_PERMISSION_KEYS = [
  "change_group_info",
  "delete_messages",
  "remove_members",
  "invite_members",
  "pin_messages",
  "manage_group_calls",
  "edit_member_tags",
  "add_new_admins",
] as const;

export const MEMBER_PERMISSION_KEYS = [
  "send_messages",
  "send_photos",
  "send_videos",
  "send_stickers_gifs",
  "send_music",
  "send_files",
  "send_voice_messages",
  "send_video_messages",
  "embed_links",
  "send_polls",
  "send_reactions",
  "add_users",
  "pin_messages",
  "edit_own_tags",
  "change_group_info",
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  change_group_info: "Change group info",
  delete_messages: "Delete messages",
  remove_members: "Remove members",
  invite_members: "Invite members",
  pin_messages: "Pin messages",
  manage_group_calls: "Manage group calls",
  edit_member_tags: "Edit member tags",
  add_new_admins: "Add new administrators",
  manage_member_permissions: "Manage member permissions",
  send_messages: "Send messages",
  send_photos: "Send photos",
  send_videos: "Send videos",
  send_stickers_gifs: "Send stickers and GIFs",
  send_music: "Send music",
  send_files: "Send files",
  send_voice_messages: "Send voice messages",
  send_video_messages: "Send video messages",
  embed_links: "Embed links",
  send_polls: "Send polls",
  send_reactions: "Send reactions",
  add_users: "Add users",
  edit_own_tags: "Edit own member tag",
};

export function groupPermissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? "Unknown permission";
}
