import { describe, expect, it } from "vitest";
import {
  buildIceServers,
  createDefaultRtcConfigurationSource,
  resolveRtcConfiguration,
} from "./iceServerConfig";

const env = (values: Record<string, string | undefined>): ImportMetaEnv => values as ImportMetaEnv;

describe("RTC configuration source", () => {
  it("uses the default Google STUN server without TURN variables", async () => {
    const source = createDefaultRtcConfigurationSource(env({}));

    await expect(source.getConfiguration()).resolves.toEqual({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  });

  it("uses custom STUN and omits the default", () => {
    expect(buildIceServers(env({ VITE_WEBRTC_STUN_URL: " stun:stun.example.test:3478 " }))).toEqual([
      { urls: "stun:stun.example.test:3478" },
    ]);
  });

  it("includes complete static TURN credentials", () => {
    expect(buildIceServers(env({
      VITE_WEBRTC_STUN_URL: "stun:stun.example.test:3478",
      VITE_WEBRTC_TURN_URL: "turn:turn.example.test:3478",
      VITE_WEBRTC_TURN_USERNAME: "turn-user",
      VITE_WEBRTC_TURN_CREDENTIAL: "turn-secret",
    }))).toEqual([
      { urls: "stun:stun.example.test:3478" },
      { urls: "turn:turn.example.test:3478", username: "turn-user", credential: "turn-secret" },
    ]);
  });

  it.each([
    ["URL only", { VITE_WEBRTC_TURN_URL: "turn:example.test" }],
    ["URL and username", { VITE_WEBRTC_TURN_URL: "turn:example.test", VITE_WEBRTC_TURN_USERNAME: "user" }],
    ["URL and credential", { VITE_WEBRTC_TURN_URL: "turn:example.test", VITE_WEBRTC_TURN_CREDENTIAL: "secret" }],
    ["username and credential", { VITE_WEBRTC_TURN_USERNAME: "user", VITE_WEBRTC_TURN_CREDENTIAL: "secret" }],
    ["blank values", { VITE_WEBRTC_TURN_URL: " ", VITE_WEBRTC_TURN_USERNAME: "\t", VITE_WEBRTC_TURN_CREDENTIAL: "" }],
  ])("omits incomplete TURN configuration: %s", (_name, values) => {
    expect(buildIceServers(env(values))).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["primitive", 1],
    ["non-array iceServers", { iceServers: "stun:example.test" }],
    ["malformed ICE server", { iceServers: [null] }],
    ["malformed urls", { iceServers: [{ urls: [" "] }] }],
    ["invalid credential fields", { iceServers: [{ urls: "turn:example.test", username: 1, credential: { secret: "hidden" } }] }],
  ])("rejects structurally invalid configuration: %s", async (_name, value) => {
    await expect(resolveRtcConfiguration({
      getConfiguration: async () => value as RTCConfiguration,
    })).rejects.toMatchObject({ message: "RTC configuration unavailable" });
  });

  it("returns defensive snapshots and does not leak rejected source errors", async () => {
    const original = {
      iceServers: [{
        urls: ["stun:example.test", "turn:example.test"],
        username: "private-user",
        credential: "private-secret",
      }],
    };
    const source = { getConfiguration: async () => original };
    const first = await resolveRtcConfiguration(source);

    original.iceServers[0].urls[0] = "stun:mutated.test";
    (first.iceServers![0].urls as string[])[0] = "stun:resolved-mutated.test";
    const second = await resolveRtcConfiguration(source);

    expect(second).toEqual({
      iceServers: [{
        urls: ["stun:mutated.test", "turn:example.test"],
        username: "private-user",
        credential: "private-secret",
      }],
    });

    let error: Error;
    try {
      await resolveRtcConfiguration({
        getConfiguration: async () => { throw new Error("credential=private-secret username=private-user"); },
      });
      throw new Error("expected configuration failure");
    } catch (reason) {
      error = reason as Error;
    }
    expect(error.message).toBe("RTC configuration unavailable");
    expect(error.message).not.toContain("private-secret");
    expect(error.message).not.toContain("private-user");
  });
});
