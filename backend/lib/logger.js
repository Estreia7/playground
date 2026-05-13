const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function log(level, ...args) {
  if (LEVELS[level] < LEVEL) return;
  const ts = new Date().toISOString();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${ts}] [${level}]`, ...args);
}

module.exports = {
  debug: (...a) => log('debug', ...a),
  info:  (...a) => log('info', ...a),
  warn:  (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
};
