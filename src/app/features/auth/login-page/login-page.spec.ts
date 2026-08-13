import { safeReturnUrl } from './login-page';

describe('safeReturnUrl', () => {
  it('allows only internal forms routes', () => {
    expect(safeReturnUrl('/forms')).toBe('/forms');
    expect(safeReturnUrl('/forms/customer-feedback?step=review')).toBe(
      '/forms/customer-feedback?step=review',
    );
  });

  it('rejects external, protocol-relative, encoded, and malformed destinations', () => {
    expect(safeReturnUrl('https://example.com/forms')).toBe('/forms');
    expect(safeReturnUrl('//example.com/forms')).toBe('/forms');
    expect(safeReturnUrl('%2F%2Fexample.com/forms')).toBe('/forms');
    expect(safeReturnUrl('/forms\\example.com')).toBe('/forms');
    expect(safeReturnUrl('/admin')).toBe('/forms');
  });
});
