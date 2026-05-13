const EventEmitter = require('events');
const store = require('./jobStore');

const bus = new EventEmitter();
bus.setMaxListeners(0);

function emit(jobId, type, payload) {
  const seq = store.appendEvent({ jobId, type, payload });
  const evt = { seq, jobId, type, payload, ts: Math.floor(Date.now() / 1000) };
  bus.emit('event', evt);
  return evt;
}

function onEvent(handler) {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}

module.exports = { emit, onEvent };
