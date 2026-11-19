import { Role } from '../models/auth.models';

export const DEMO_PASSWORD = 'demo1234';

// mirrors backend/app/seed.py: name, email, role, active, days since sign-up, days since last login
export const DEMO_USERS: [string, string, Role, boolean, number, number | null][] = [
  ['Ava Thompson', 'admin@demo.dev', 'admin', true, 120, 0],
  ['Liam Carter', 'user@demo.dev', 'user', true, 95, 1],
  ['Sofia Martinez', 'sofia.martinez@demo.dev', 'admin', true, 88, 2],
  ['Noah Becker', 'noah.becker@demo.dev', 'user', true, 74, 3],
  ['Emma Lindqvist', 'emma.lindqvist@demo.dev', 'user', true, 61, 6],
  ['Lucas Moreau', 'lucas.moreau@demo.dev', 'user', false, 57, 40],
  ['Mia Rossi', 'mia.rossi@demo.dev', 'user', true, 43, 1],
  ['Ethan Walker', 'ethan.walker@demo.dev', 'user', true, 36, 12],
  ['Chloe Dubois', 'chloe.dubois@demo.dev', 'user', true, 29, 4],
  ['Daniel Novak', 'daniel.novak@demo.dev', 'user', false, 22, 21],
  ['Hannah Schmidt', 'hannah.schmidt@demo.dev', 'user', true, 15, 0],
  ['Oliver Jensen', 'oliver.jensen@demo.dev', 'user', true, 9, 2],
  ['Isabella Costa', 'isabella.costa@demo.dev', 'user', true, 5, 1],
  ["James O'Connor", 'james.oconnor@demo.dev', 'user', true, 3, null],
  ['Zoe Fischer', 'zoe.fischer@demo.dev', 'user', true, 1, 0],
];
