import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('CSV 导出', () => {
  it('含逗号的字段加引号，并转义双引号', () => {
    const csv = toCsv(['a', 'b'], [
      [1, 'x,y'],
      [2, 'he said "hi"'],
    ]);
    expect(csv).toBe('a,b\r\n1,"x,y"\r\n2,"he said ""hi"""');
  });
});
