import fs from 'node:fs';
const FILE = process.env.DATA_FILE || './data.json';
const empty = { history: [], reminders: [], tasks: [], notifications: [], pending: [], bookings: [], memory: '' };
let data = empty;
try { data = { ...empty, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
export const db = data;
export const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
export const id = () => Math.random().toString(36).slice(2, 9);
