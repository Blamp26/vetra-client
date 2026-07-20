import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_STATES,
  DIRECTED_CALL_CAPABILITY,
  DIRECTED_CALL_EVENTS,
  DIRECTED_CALL_PROTOCOL_VERSION,
  buildCommand,
  buildInitiate,
  buildJoin,
  buildSetupFailed,
  buildSignal,
  buildSync,
  classifyState,
  decodeCommand,
  decodeInitiate,
  decodeSignal,
  decodeState,
  decodeSetupFailed,
  decodeSync,
} from "./directedCallProtocol";

const device = "11111111-1111-4111-8111-111111111111";
const call = "33333333-3333-4333-8333-333333333333";
const command = "22222222-2222-4222-8222-222222222222";
const target = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const state = {
  protocol_version: 1 as const,
  call_id: call,
  state: "presented" as const,
  state_version: 3,
  media: "audio" as const,
  participant_role: "recipient" as const,
  peer: { user_id: target, username: "alice" },
  created_at: "2026-01-02T03:04:05.123456Z",
  presented_at: "2026-01-02T03:04:09.123456Z",
  accepted_at: null,
  connecting_at: null,
  active_at: null,
  ended_at: null,
};

describe("directed call V1 protocol", () => {
  it("defines exact constants and builds join/initiate/commands", () => {
    expect(DIRECTED_CALL_PROTOCOL_VERSION).toBe(1);
    expect(DIRECTED_CALL_CAPABILITY).toBe("directed_calls_v1");
    expect(DIRECTED_CALL_EVENTS.signal).toBe("call:signal");
    expect(buildJoin(device)).toEqual({ protocol_version: 1, capabilities: ["directed_calls_v1"], device_id: device });
    expect(buildInitiate(command, device, target)).toMatchObject({ protocol_version: 1, media: "audio", target_user_id: target });
    for (const event of ["received", "presented", "accept", "beginConnecting", "mediaReady", "cancel", "decline", "hangup"] as const) {
      expect(buildCommand(call, command, device)).toEqual({ protocol_version: 1, call_id: call, command_id: command, device_id: device });
      expect(DIRECTED_CALL_EVENTS[event]).toMatch(/^call:/);
    }
    expect(buildSetupFailed(call, command, device, "permission_denied").failure_code).toBe("permission_denied");
  });

  it("enforces sync bounds and setup failure values", () => {
    expect(buildSync(command, device, [{ call_id: call, state_version: 3 }]).known_calls).toHaveLength(1);
    expect(() => buildSync(command, device, [{ call_id: call, state_version: -1 }])).toThrow();
    expect(() => buildSetupFailed(call, command, device, "unsafe" as never)).toThrow();
    expect(() => buildInitiate(command, device, "42")).toThrow();
  });

  it("decodes only the safe canonical state fields", () => {
    const decoded = decodeState({ ...state, internal_user_id: 42, device_id: device });
    expect(decoded).toEqual(state);
    expect(decoded).not.toHaveProperty("device_id");
    expect(decodeState({ ...state, state: "preparing" })).toBeNull();
    expect(decodeState({ ...state, state_version: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
  });

  it("classifies unseen, newer, duplicate, stale, and conflicting projections", () => {
    expect(classifyState(null, state)).toBe("accept");
    expect(classifyState(state, { ...state, state_version: 4 })).toBe("accept");
    expect(classifyState(state, { ...state, state_version: 2 })).toBe("stale");
    expect(classifyState(state, state)).toBe("duplicate");
    expect(classifyState(state, { ...state, username: "ignored" })).toBe("duplicate");
    expect(classifyState(state, { ...state, state: "accepted" })).toBe("conflict");
  });

  it("keeps signaling independent of state version and strips device identity on decode", () => {
    const outbound = buildSignal(call, "99999999-9999-4999-8999-999999999999", device, "offer", { sdp: "v=0" });
    expect(outbound.device_id).toBe(device);
    const { device_id: _deviceId, ...inboundPayload } = outbound;
    const inbound = decodeSignal(inboundPayload);
    expect(inbound).not.toBeNull();
    expect(inbound).not.toHaveProperty("device_id");
    expect(decodeSignal({ ...inboundPayload, state_version: 3 })).toBeNull();
    expect(decodeSignal({ ...outbound, kind: "unknown" })).toBeNull();
    const answer = buildSignal(call, "88888888-8888-4888-8888-888888888888", device, "answer", { sdp: "v=0" });
    const { device_id: _answerDeviceId, ...answerInbound } = answer;
    expect(decodeSignal(answerInbound)).toMatchObject({ kind: "answer", call_id: call });
    expect(buildSignal(call, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", device, "ice_candidate", { candidate: "candidate:1", sdp_mid: null, sdp_mline_index: 0, username_fragment: null }).signal_id).not.toBe(outbound.signal_id);
    const secret = "secret-sdp";
    expect(() => buildSignal(call, "77777777-7777-4777-8777-777777777777", device, "offer", { sdp: "x".repeat(262145) })).toThrow("invalid directed-call signal");
    expect(() => buildSignal(call, "66666666-6666-4666-8666-666666666666", device, "offer", { sdp: secret, screen_share: true } as never)).toThrow("invalid directed-call signal");
    try {
      buildSignal(call, "55555555-5555-4555-8555-555555555555", device, "offer", { sdp: secret, screen_share: true } as never);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("keeps the wire state enum free of local and viewer-projection states", () => {
    expect(CANONICAL_STATES).not.toContain("preparing");
    expect(CANONICAL_STATES).not.toContain("resolving");
    expect(CANONICAL_STATES).not.toContain("missed");
  });

  it("decodes the shared fixtures and verifies their manifest hashes", () => {
    const root = resolve(process.cwd(), "test/fixtures/directed_call_v1");
    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    expect(decodeState(JSON.parse(readFileSync(resolve(root, "state.presented.valid.json"), "utf8")))).not.toBeNull();
    const validSignal = JSON.parse(readFileSync(resolve(root, "signal.offer.valid.json"), "utf8"));
    const { device_id: _fixtureDeviceId, ...validInboundSignal } = validSignal;
    expect(decodeSignal(validInboundSignal)).not.toBeNull();
    expect(decodeState({ ...state, state: "preparing" })).toBeNull();
    for (const name of manifest.invalid as string[]) {
      const fixture = JSON.parse(readFileSync(resolve(root, name), "utf8"));
      let decoded: unknown;

      if (name.startsWith("initiate.")) decoded = decodeInitiate(fixture);
      else if (name.startsWith("command.")) decoded = decodeCommand(fixture);
      else if (name.startsWith("setup_failed.")) decoded = decodeSetupFailed(fixture);
      else if (name.startsWith("state.")) {
        if (name.includes("device_id")) {
          decoded = decodeState(fixture);
          expect(decoded).not.toBeNull();
          expect(decoded).not.toHaveProperty("device_id");
          continue;
        }
        decoded = decodeState(fixture);
      } else if (name.startsWith("sync.")) decoded = decodeSync(fixture);
      else if (name.includes("oversized_sdp")) {
        decoded = decodeSignal({
          ...fixture,
          signal_id: "99999999-9999-4999-8999-999999999999",
          payload: { sdp: "x".repeat(fixture.sdp_bytes) },
        });
      } else {
        decoded = decodeSignal(fixture);
        if (name.includes("state_version")) {
          expect(decoded).toBeNull();
          continue;
        }
      }

      expect(decoded).toBeNull();
    }
    for (const [name, expected] of Object.entries<string>(manifest.sha256)) {
      const actual = createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex");
      expect(actual).toBe(expected);
    }
  });
});
