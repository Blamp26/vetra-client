/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_SOCKET_URL?: string;
    readonly VITE_WEBRTC_STUN_URL?: string;
    readonly VITE_WEBRTC_TURN_URL?: string;
    readonly VITE_WEBRTC_TURN_USERNAME?: string;
    readonly VITE_WEBRTC_TURN_CREDENTIAL?: string;
    readonly VITE_WEBRTC_SHOW_DIAGNOSTICS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
