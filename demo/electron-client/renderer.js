const groups = document.querySelector("#groups");
const consoleList = document.querySelector("#console");
const state = { seq: 0, current: null };
// Trigger correlation: ping carries a correlationId that the backend echoes on
// backend:pong, so replies land in the exact group that sent them even when
// several triggers are in flight.
const groupsByCorrelationId = new Map();

const COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5 6.5 12 13 4.5"/></svg>';
function copyButton(getText) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.title = "Copy JSON";
  button.innerHTML = COPY_ICON;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      button.classList.add("copied");
      button.innerHTML = CHECK_ICON;
      setTimeout(() => {
        button.classList.remove("copied");
        button.innerHTML = COPY_ICON;
      }, 1200);
    } catch { /* clipboard unavailable in this context */ }
  });
  return button;
}

// Every button click starts a numbered group; messages received after the
// trigger (e.g. backend:pong) land inside that group until the next trigger.
function startGroup(title, correlationId) {
  state.seq += 1;
  const group = document.createElement("article");
  group.className = "group";
  const head = document.createElement("div");
  head.className = "group-head";
  const gid = document.createElement("span");
  gid.className = "gid";
  gid.textContent = `#${state.seq}`;
  const name = document.createElement("b");
  name.textContent = title;
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString();
  const status = document.createElement("span");
  status.className = "gstatus";
  status.textContent = "pending";
  head.append(gid, name, time, status);
  const body = document.createElement("div");
  body.className = "group-body";
  const items = document.createElement("ol");
  items.className = "group-items";
  body.appendChild(items);
  group.append(head, body);
  groups.prepend(group);
  state.current = { status, items, count: 0 };
  if (correlationId) groupsByCorrelationId.set(correlationId, state.current);
  return state.current;
}

function addGroupItem(kind, value, ctx) {
  const target = ctx ?? state.current ?? startGroup("received");
  target.count += 1;
  target.status.textContent = `${target.count} msg${target.count > 1 ? "s" : ""}`;
  const li = document.createElement("li");
  const head = document.createElement("div");
  head.className = "msg-head";
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString();
  const label = document.createElement("b");
  label.textContent = kind;
  const body = document.createElement("pre");
  body.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  head.append(time, label, copyButton(() => body.textContent));
  li.append(head, body);
  target.items.appendChild(li);
}

// Console panel: logger output plus connection/member activity. Appended to a
// scrollable list and never cleared; auto-scroll sticks to the bottom only
// while the user is already at the bottom.
function appendConsole(tag, message, data, traceId) {
  const stick = consoleList.scrollTop + consoleList.clientHeight >= consoleList.scrollHeight - 24;
  const row = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString();
  const level = document.createElement("b");
  level.textContent = tag;
  level.className = tag.replace(/^log:/, "");
  const body = document.createElement("code");
  const text = `${message ?? ""}${data === undefined ? "" : ` ${JSON.stringify(data)}`}${traceId ? `  [trace ${traceId}]` : ""}`;
  body.textContent = text;
  row.append(time, level, body);
  consoleList.appendChild(row);
  if (stick) consoleList.scrollTop = consoleList.scrollHeight;
}

function setConnection(connectionState) {
  document.querySelector("#status").textContent = connectionState;
  document.querySelector("#status-dot").className = connectionState;
}

window.procm.onState((value) => {
  setConnection(value);
  appendConsole("state", value);
});
window.procm.onMember(({ event, member }) => {
  appendConsole("member", `${event} ${member.memberId}`);
});
window.procm.onMessage((message) => {
  const target = message.correlationId ? groupsByCorrelationId.get(message.correlationId) : undefined;
  addGroupItem(message.topic, message.payload, target);
});
window.procm.onLog((log) => appendConsole(`log:${log.level}`, log.message, log.data, log.traceId));

document.querySelector("#wait-ready").addEventListener("click", async () => {
  startGroup("Wait for backend");
  try {
    const ready = await window.procm.waitReady();
    addGroupItem("backend:ready", ready);
  } catch (error) {
    addGroupItem("wait:error", String(error));
  }
});
document.querySelector("#ping").addEventListener("click", () => {
  const correlationId = crypto.randomUUID();
  const ctx = startGroup("Send ping", correlationId);
  addGroupItem("published", { topic: "backend:ping", correlationId, payload: { sentAt: Date.now(), source: "electron-ui" } }, ctx);
  window.procm.ping({ sentAt: Date.now(), source: "electron-ui" }, correlationId);
});
document.querySelector("#sample-logs").addEventListener("click", () => {
  startGroup("Emit log sample");
  addGroupItem("published", { topic: "backend:log-sample", note: "logs arrive in the console panel" });
  window.procm.sampleLogs();
});
document.querySelector("#hook-trace").addEventListener("click", async () => {
  startGroup("Emit hook trace");
  try {
    addGroupItem("hook-trace", await window.procm.hookTrace());
  } catch (error) {
    addGroupItem("hook-trace:error", String(error));
  }
});
document.querySelector("#clear").addEventListener("click", () => {
  groups.replaceChildren();
  groupsByCorrelationId.clear();
  state.current = null;
});

window.procm.snapshot().then((snapshot) => {
  setConnection(snapshot.state);
  document.querySelector("#identity").textContent = `${snapshot.roomId} / ${snapshot.memberId}`;
  window.procm.frontendLog({ action: "renderer-ready", roomId: snapshot.roomId });
});
