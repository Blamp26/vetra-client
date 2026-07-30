import { CLIENT_PROTOCOL_VERSION } from "@/shared/clientProtocol";

export function UpdateRequiredScreen() {
  return (
    <div
      className="vt-auth-workspace vt-workspace"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh" }}
    >
      <main
        className="vt-auth-centering"
        style={{ maxWidth: 460, margin: "0 auto", padding: 32 }}
      >
        <section
          className="vt-auth-composition"
          role="alert"
          data-testid="update-required-screen"
        >
          <h1 className="text-xl font-semibold text-foreground">
            Update required
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This Vetra release is no longer supported. Install the current
            release to continue.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Supported client protocol: {CLIENT_PROTOCOL_VERSION}
          </p>
        </section>
      </main>
    </div>
  );
}
