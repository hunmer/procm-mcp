export function invokeFirst(fn, value) {
  return invokeSecond(fn, value);
}

function invokeSecond(fn, value) {
  return invokeThird(fn, value);
}

function invokeThird(fn, value) {
  return fn(value);
}
