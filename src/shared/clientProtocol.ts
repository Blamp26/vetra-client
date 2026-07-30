export const CLIENT_PROTOCOL_VERSION = 1;
export const CLIENT_PROTOCOL_HEADER = "x-vetra-client-protocol-version";
export const CLIENT_PROTOCOL_SOCKET_PARAM = "client_protocol_version";
export const UPDATE_REQUIRED_CODE = "update_required";

export function clientProtocolHeaders(): Record<string, string> {
  return { [CLIENT_PROTOCOL_HEADER]: String(CLIENT_PROTOCOL_VERSION) };
}

export type UpdateRequiredMetadata = {
  minimum_supported_protocol_version?: number;
  current_client_protocol_version?: number | null;
};
