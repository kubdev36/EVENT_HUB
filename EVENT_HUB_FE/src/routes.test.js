import { describe, expect, it } from 'vitest';
import { canAccessView, pathToView, viewToPath } from './routes';

describe('pathToView / viewToPath', () => {
  it('đường dẫn cố định và trang phòng ban động', () => {
    expect(pathToView('/overview')).toBe('overview');
    expect(pathToView('/media-library/')).toBe('media-library');
    expect(pathToView('/department/mkt')).toBe('dept-mkt');
    expect(viewToPath('dept-kinh_doanh')).toBe('/department/kinh_doanh');
    expect(viewToPath('reports')).toBe('/reports');
  });

  it('đường dẫn lạ thì null; id lạ thì về Tổng quan', () => {
    expect(pathToView('/khong-co')).toBeNull();
    expect(pathToView('/department/../setting')).toBeNull();
    expect(viewToPath('khong-co')).toBe('/overview');
  });
});

describe('canAccessView', () => {
  const admin = { role: 'admin', department: 'mkt' };
  const mkt = { role: 'staff', department: 'mkt' };

  it('admin xem mọi trang', () => {
    for (const v of ['setting', 'sale', 'dept-internal', 'reports']) expect(canAccessView(admin, v)).toBe(true);
  });

  it('nhân viên: không vào Cài đặt; chỉ vào trang phòng ban của mình', () => {
    expect(canAccessView(mkt, 'setting')).toBe(false);
    expect(canAccessView(mkt, 'marketing')).toBe(true);
    expect(canAccessView(mkt, 'sale')).toBe(false);
    expect(canAccessView(mkt, 'dept-mkt')).toBe(true);
    expect(canAccessView(mkt, 'dept-kinh_doanh')).toBe(false);
    expect(canAccessView(mkt, 'overview')).toBe(true);
  });

  it('chưa có user hoặc trang không xác định thì từ chối trang cần quyền', () => {
    expect(canAccessView(null, 'setting')).toBe(false);
    expect(canAccessView(null, 'sale')).toBe(false);
    expect(canAccessView(mkt, null)).toBe(false);
  });
});
