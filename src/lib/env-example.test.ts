import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_PUBLIC, checkEnv } from './env-check';

const text = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
const active = Object.fromEntries(
  text.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

describe('.env.example', () => {
  it('lists every required public variable', () => {
    for (const name of REQUIRED_PUBLIC) expect(active, name).toHaveProperty(name);
  });
  it('contains no secret and does not enable mock mode', () => {
    const problems = checkEnv({ ...active, NODE_ENV: 'production' }).issues.map((i) => i.problem);
    expect(problems.filter((p) => /secret|service-role|mock/i.test(p))).toEqual([]);
    expect(active.NEXT_PUBLIC_UI_DATA_MODE).toBeUndefined();
    expect(Object.values(active).join(" ")).not.toMatch(/SERVICE[_-]?ROLE|sb_secret_/i);
  });
});
