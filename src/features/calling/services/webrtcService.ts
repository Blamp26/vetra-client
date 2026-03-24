import { Channel } from 'phoenix';

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
];

export class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private channel: Channel;
    private localUserId: number;
    private remoteUserId: number;
    private iceCandidateQueue: RTCIceCandidateInit[] = [];
    private remoteDescriptionSet = false;

    public onRemoteStream: (stream: MediaStream) => void = () => { };
    public onCallIdReceived: ((callId: string) => void) | null = null;

    constructor(channel: Channel, localUserId: number, remoteUserId: number) {
        this.channel = channel;
        this.localUserId = localUserId;
        this.remoteUserId = remoteUserId;
    }

    async startCall(): Promise<void> {
        if (this.peerConnection) throw new Error('Call already started');
        await this.initPeerConnection();
        const offer = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offer);
        this.channel.push('offer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
        }).receive('ok', ({ call_id }: { call_id: string }) => {
            if (this.onCallIdReceived) this.onCallIdReceived(call_id);
        });
    }

    async acceptCall(remoteSdp: string): Promise<void> {
        if (this.peerConnection) throw new Error('Call already accepted');
        await this.initPeerConnection();
        await this.peerConnection!.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: remoteSdp })
        );
        this.remoteDescriptionSet = true;
        await this.flushIceCandidateQueue();

        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);

        const callId = `${this.remoteUserId}:${this.localUserId}`;
        this.channel.push('answer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
            call_id: callId,
        });
    }

    async handleAnswer(sdp: string): Promise<void> {
        if (!this.peerConnection) throw new Error('No peer connection');
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp })
        );
        this.remoteDescriptionSet = true;
        await this.flushIceCandidateQueue();
    }

    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.peerConnection) return;
        if (!this.remoteDescriptionSet) {
            this.iceCandidateQueue.push(candidate);
            return;
        }
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('[WebRTC] Failed to add ICE candidate:', err);
        }
    }

    private async flushIceCandidateQueue(): Promise<void> {
        while (this.iceCandidateQueue.length > 0) {
            const candidate = this.iceCandidateQueue.shift()!;
            try {
                await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error('[WebRTC] Failed to flush ICE candidate:', err);
            }
        }
    }

    hangUp(): void {
        this.peerConnection?.close();
        this.peerConnection = null;
        this.localStream?.getTracks().forEach(track => track.stop());
        this.localStream = null;
        this.iceCandidateQueue = [];
        this.remoteDescriptionSet = false;
    }

    private async initPeerConnection(): Promise<void> {
        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
        });
        this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.localStream.getTracks().forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
        });
        this.peerConnection.onicecandidate = (event) => {
            if (!event.candidate) return;
            const callId = `${this.remoteUserId}:${this.localUserId}`;
            this.channel.push('ice_candidate', {
                candidate: event.candidate,
                to_user_id: this.remoteUserId,
                call_id: callId,
            });
        };
        this.peerConnection.ontrack = (event) => {
            if (event.streams[0]) {
                this.onRemoteStream(event.streams[0]);
            }
        };
    }
}