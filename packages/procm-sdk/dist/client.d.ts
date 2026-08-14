import { type JsonValue, type RoomMember, type RoomMessage } from "./protocol.js";
type ConnectionState = "connecting" | "open" | "closed";
type MessageHandler = (message: RoomMessage) => void;
type MemberHandler = (event: "joined" | "left" | "replaced", member: RoomMember) => void;
type StateHandler = (state: ConnectionState) => void;
export interface ProcmClientOptions {
    url?: string;
    roomId?: string;
    processId?: string;
    clientName?: string;
    memberId?: string;
    token?: string;
    metadata?: Record<string, JsonValue>;
    reconnect?: boolean;
    webSocketFactory?: (url: string, protocols?: string[]) => WebSocket;
}
export interface SubscribeOptions {
    prefix?: boolean;
}
export interface PublishOptions {
    retain?: boolean;
}
export interface WaitForOptions<T = JsonValue> {
    prefix?: boolean;
    filter?: (payload: T, message: RoomMessage<T>) => boolean;
    timeout?: number;
    signal?: AbortSignal;
}
export declare class ProcmClient {
    readonly roomId: string;
    readonly processId?: string;
    readonly clientName: string;
    readonly memberId: string;
    private readonly options;
    private readonly subscriptions;
    private readonly memberHandlers;
    private readonly stateHandlers;
    private socket;
    private disposed;
    private reconnectAttempt;
    private reconnectTimer;
    private heartbeatTimer;
    private state;
    constructor(options?: ProcmClientOptions);
    get connectionState(): ConnectionState;
    connect(): void;
    subscribe(topic: string, handler: MessageHandler, options?: SubscribeOptions): () => void;
    publish(topic: string, payload: JsonValue, options?: PublishOptions): string;
    waitFor<T extends JsonValue = JsonValue>(topic: string, options?: WaitForOptions<T>): Promise<RoomMessage<T>>;
    onMember(handler: MemberHandler): () => void;
    onState(handler: StateHandler): () => void;
    close(): void;
    private handleMessage;
    private handleClose;
    private send;
    private sendSubscription;
    private setState;
}
export declare function createProcmClient(options?: ProcmClientOptions): ProcmClient;
export {};
//# sourceMappingURL=client.d.ts.map