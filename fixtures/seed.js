#!/usr/bin/env node
/** Creates fixtures/demo.db with synthetic data. No real records anywhere in this repo. */
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'fixtures/demo.db';
mkdirSync(dirname(OUT), { recursive: true });
const db = new Database(OUT);

db.exec(`
  DROP TABLE IF EXISTS runs; DROP TABLE IF EXISTS projects;
  CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, language TEXT, created TEXT);
  CREATE TABLE runs (id INTEGER PRIMARY KEY, project_id INTEGER, status TEXT, duration_ms INTEGER, ran_at TEXT);
`);

const projects = [
  [1,'orbital-ledger','TypeScript','2026-01-14'], [2,'tin-whistle','Python','2026-02-02'],
  [3,'paper-lantern','Go','2026-03-19'],          [4,'switchback','Rust','2026-04-08'],
];
const ins = db.prepare('INSERT INTO projects VALUES (?,?,?,?)');
for (const p of projects) ins.run(...p);

const statuses = ['passed','passed','passed','failed','flaky'];
const run = db.prepare('INSERT INTO runs (project_id,status,duration_ms,ran_at) VALUES (?,?,?,?)');
for (let i = 0; i < 60; i++) {
  run.run((i % 4) + 1, statuses[i % statuses.length], 800 + (i * 137) % 9000,
          `2026-05-${String((i % 28) + 1).padStart(2,'0')}`);
}

mkdirSync('fixtures/files', { recursive: true });
writeFileSync('fixtures/files/notes.md', '# Notes\n\nSynthetic fixture for the filesystem server.\n');
writeFileSync('fixtures/files/changelog.txt', '0.1.0 - initial\n');

console.log(`seeded ${OUT}: ${projects.length} projects, 60 runs`);
db.close();
