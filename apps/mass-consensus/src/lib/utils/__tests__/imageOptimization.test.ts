import { isOptimizableImageUrl } from '../imageOptimization';

describe('isOptimizableImageUrl', () => {
  it('accepts public Cloud Storage URLs', () => {
    expect(isOptimizableImageUrl('https://storage.googleapis.com/bucket/statements/s1/card-1-a.png')).toBe(true);
  });

  it('accepts Firebase Storage download URLs', () => {
    expect(
      isOptimizableImageUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/a.jpg?alt=media&token=t')
    ).toBe(true);
  });

  it('rejects the local Storage emulator', () => {
    expect(isOptimizableImageUrl('http://localhost:9199/v0/b/bucket/o/a.png?alt=media')).toBe(false);
  });

  it('rejects other hosts and plain http', () => {
    expect(isOptimizableImageUrl('https://example.com/a.png')).toBe(false);
    expect(isOptimizableImageUrl('http://storage.googleapis.com/bucket/a.png')).toBe(false);
  });

  it('rejects strings that are not URLs', () => {
    expect(isOptimizableImageUrl('not a url')).toBe(false);
    expect(isOptimizableImageUrl('')).toBe(false);
  });
});
