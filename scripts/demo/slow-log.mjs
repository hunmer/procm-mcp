// Demo script: alternate between stdout and stderr to exercise both log
// streams in the dashboard. Switch the LogPanel between stdout/stderr to see
// each one update live.
let i = 0;
setInterval(() => {
  if (i % 2 === 0) console.log(`stdout line ${i} · ${new Date().toISOString()}`);
  else console.error(`stderr line ${i} · ${new Date().toISOString()}`);
  i++;
}, 1000);
