const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function open() {
  if (db) return db;

  const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  runMigrations(db);

  return db;
}

function runMigrations(db) {
  // Idempotent ALTERs for columns added after the initial schema.
  // Use try/catch because SQLite raises "duplicate column name" when the
  // column already exists — there's no IF NOT EXISTS for ADD COLUMN.
  try {
    db.exec(`ALTER TABLE listings ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 0`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

function getDb() {
  if (!db) open();
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { open, getDb, close };
