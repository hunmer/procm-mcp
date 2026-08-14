const events = document.querySelector("#events");
const state = { roundtrips: 0, members: new Set() };

function addEvent(kind, value) {
  const row = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString();
  const type = document.createElement("b");
  type.textContent = kind;
  const body = document.createElement("pre");
  body.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  row.append(time, type, body);
  events.prepend(row);
}

function setConnection(connectionState) {
  document.querySelector("#status").textContent = connectionState;
  document.querySelector("#status-dot").className = connectionState;
}

window.procm.onState((value) => { setConnection(value); addEvent("state", value); });
window.procm.onMember(({ event, member }) => {
  if (event === "left") state.members.delete(member.memberId); else state.members.add(member.memberId);
  document.querySelector("#members").textContent = String(state.members.size);
  addEvent(`member:${event}`, member);
});
window.procm.onMessage((message) => {
  state.roundtrips += 1;
  document.querySelector("#roundtrips").textContent = String(state.roundtrips);
  addEvent(message.topic, message.payload);
});
window.procm.onLog((log) => addEvent(`log:${log.level}`, log));

document.querySelector("#wait-ready").addEventListener("click", async () => {
  document.querySelector("#backend").textContent = "waiting";
  try {
    const ready = await window.procm.waitReady();
    document.querySelector("#backend").textContent = "ready";
    addEvent("backend:ready", ready);
  } catch (error) {
    document.querySelector("#backend").textContent = "timeout";
    addEvent("wait:error", String(error));
  }
});
document.querySelector("#ping").addEventListener("click", () => window.procm.ping({ sentAt: Date.now(), source: "electron-ui" }));
document.querySelector("#sample-logs").addEventListener("click", () => window.procm.sampleLogs());
document.querySelector("#clear").addEventListener("click", () => events.replaceChildren());

window.procm.snapshot().then((snapshot) => {
  setConnection(snapshot.state);
  document.querySelector("#identity").textContent = `${snapshot.roomId} / ${snapshot.memberId}`;
  window.procm.frontendLog({ action: "renderer-ready", roomId: snapshot.roomId });
});
