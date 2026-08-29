function httpBase(client) {
    const target = client.connectionTarget;
    if (!target.url)
        throw new Error("procm HTTP URL is required");
    return {
        base: target.url.replace(/^ws(s?):\/\//, "http$1://").replace(/\/room\/?$/, ""),
        token: target.token,
    };
}
async function request(client, method, path, body) {
    const { base, token } = httpBase(client);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const init = { method, headers };
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok)
        throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
}
export function listProcesses(client) {
    return request(client, "GET", "/api/processes");
}
export function getProcess(client, id) {
    return request(client, "GET", `/api/processes/${encodeURIComponent(id)}`);
}
export function updateProcess(client, id, updates) {
    return request(client, "PATCH", `/api/processes/${encodeURIComponent(id)}`, updates);
}
export function getServerLogInfo(client) {
    return request(client, "GET", "/api/server-log");
}
export function updateServerLogMaxBytes(client, maxBytes) {
    return request(client, "PUT", "/api/server-log/settings", { maxBytes });
}
export function clearServerLogs(client) {
    return request(client, "DELETE", "/api/server-log");
}
export function clearProcessLogs(client, id) {
    return request(client, "DELETE", `/api/processes/${encodeURIComponent(id)}/logs`);
}
export function killSystemProcess(client, pid, tree = true) {
    return request(client, "POST", `/api/system-processes/${pid}/kill${tree ? "" : "?tree=0"}`).then(() => undefined);
}
/** Clear logs for the process represented by the client. */
export function clearLogs(client, id = client.processId) {
    if (!id)
        throw new Error("process id is required to clear logs");
    return clearProcessLogs(client, id);
}
export function importProcessBatch(client, items, group) {
    if (!items.length)
        throw new Error("items must be a non-empty array");
    return request(client, "POST", "/api/processes/import-batch", { items, ...(group === undefined ? {} : { group }) });
}
export const batchImportProcesses = importProcessBatch;
export async function selectDirectory(client, title) {
    const result = await request(client, "POST", "/api/select-directory", title === undefined ? {} : { title });
    return result.canceled ? null : result.path;
}
//# sourceMappingURL=rest.js.map