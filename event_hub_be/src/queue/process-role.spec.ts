import { processRole, runsWorker } from './process-role.js';

describe('PROCESS_ROLE', () => {
  it('mặc định là all (chạy cả API và worker)', () => {
    expect(processRole(undefined)).toBe('all');
    expect(runsWorker('all')).toBe(true);
  });

  it('api không chạy lịch và không xử lý việc; worker thì có', () => {
    expect(processRole('API')).toBe('api');
    expect(runsWorker('api')).toBe(false);
    expect(runsWorker('worker')).toBe(true);
  });

  it('giá trị sai thì báo lỗi thay vì lặng lẽ chạy sai vai trò', () => {
    expect(() => processRole('wroker')).toThrow('PROCESS_ROLE');
  });
});
