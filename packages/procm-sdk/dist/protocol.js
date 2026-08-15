export const PROCM_PROTOCOL_VERSION = 1;
export const PROCM_LOG_TOPIC = "$procm/log";
export const PROCM_LOG_MARKER = "@@PROCM_LOG_V1@@";
export function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseClientFrame(value) {
    if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION)
        return null;
    if (typeof value.type !== "string")
        return null;
    switch (value.type) {
        case "hello":
            return typeof value.roomId === "string" &&
                typeof value.memberId === "string" &&
                typeof value.clientName === "string"
                ? value
                : null;
        case "subscribe":
            return typeof value.subscriptionId === "string" && typeof value.topic === "string"
                ? value
                : null;
        case "unsubscribe":
            return typeof value.subscriptionId === "string"
                ? value
                : null;
        case "publish":
            return typeof value.messageId === "string" &&
                typeof value.topic === "string" &&
                typeof value.timestamp === "number" &&
                (value.correlationId === undefined || typeof value.correlationId === "string") &&
                "payload" in value
                ? value
                : null;
        case "trace:put":
            return typeof value.requestId === "string" &&
                typeof value.traceId === "string" &&
                (value.ttlSeconds === undefined || typeof value.ttlSeconds === "number") &&
                "payload" in value
                ? value
                : null;
        case "ping":
            return typeof value.timestamp === "number" ? value : null;
        default:
            return null;
    }
}
export function parseServerFrame(value) {
    if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION || typeof value.type !== "string") {
        return null;
    }
    return ["welcome", "message", "member", "error", "trace:stored", "pong"].includes(value.type)
        ? value
        : null;
}
export function matchesTopic(topic, filter, prefix = false) {
    return prefix ? topic.startsWith(filter) : topic === filter;
}
function encodeBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeBase64Url(text) {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
export function encodeStructuredLog(log) {
    return `${PROCM_LOG_MARKER}${encodeBase64Url(JSON.stringify(log))}`;
}
export function decodeStructuredLogLine(line) {
    const markerIndex = line.lastIndexOf(PROCM_LOG_MARKER);
    if (markerIndex === -1)
        return null;
    try {
        const value = JSON.parse(decodeBase64Url(line.slice(markerIndex + PROCM_LOG_MARKER.length).trim()));
        if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION)
            return null;
        if (typeof value.timestamp !== "number" ||
            !["debug", "info", "warn", "error"].includes(String(value.level)) ||
            typeof value.memberId !== "string" ||
            typeof value.clientName !== "string" ||
            typeof value.message !== "string")
            return null;
        return value;
    }
    catch {
        return null;
    }
}
export function stripStructuredLogFrame(line) {
    const markerIndex = line.lastIndexOf(PROCM_LOG_MARKER);
    return markerIndex === -1 ? line : line.slice(0, markerIndex).trimEnd();
}
//# sourceMappingURL=protocol.js.map