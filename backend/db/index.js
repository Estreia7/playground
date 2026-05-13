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

  return db;
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
