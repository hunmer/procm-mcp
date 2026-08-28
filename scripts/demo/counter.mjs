// Demo script: emit an incrementing counter to stdout once per second.
// Useful for verifying the dashboard's real-time log push.
let i = 0;
const tick = () => console.log(`counter ${++i} · ${new Date().toISOString()}`);
tick();
setInterval(tick, 1000);
