import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import nb from '../../messages/nb.json';

function keys(messages: object, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('messages', () => {
  it('bokmål and English define exactly the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(nb).sort());
  });
});
