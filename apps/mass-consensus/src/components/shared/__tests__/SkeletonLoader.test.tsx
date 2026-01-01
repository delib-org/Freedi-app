/**
 * Tests for SkeletonLoader component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import SkeletonLoader from '../SkeletonLoader';

describe('SkeletonLoader', () => {
  describe('rendering', () => {
    it('should render default 3 skeleton items', () => {
      const { container } = render(<SkeletonLoader />);

      const skeletonItems = container.querySelectorAll('.skeleton');
      // Each skeleton item has 3 skeleton divs (3 items * 3 = 9)
      expect(skeletonItems.length).toBe(9);
    });

    it('should render specified count of items', () => {
      const { container } = render(<SkeletonLoader count={5} />);

      // Each skeleton item has 3 skeleton divs (5 items * 3 = 15)
      const skeletonItems = container.querySelectorAll('.skeleton');
      expect(skeletonItems.length).toBe(15);
    });

    it('should render 1 item when count is 1', () => {
      const { container } = render(<SkeletonLoader count={1} />);

      const skeletonItems = container.querySelectorAll('.skeleton');
      expect(skeletonItems.length).toBe(3);
    });

    it('should render 0 items when count is 0', () => {
      const { container } = render(<SkeletonLoader count={0} />);

      const skeletonItems = container.querySelectorAll('.skeleton');
      expect(skeletonItems.length).toBe(0);
    });
  });

  describe('structure', () => {
    it('should render items in a flex column container', () => {
      const { container } = render(<SkeletonLoader count={1} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.display).toBe('flex');
      expect(wrapper.style.flexDirection).toBe('column');
      expect(wrapper.style.gap).toBe('1rem');
    });

    it('should render each item with border and padding', () => {
      const { container } = render(<SkeletonLoader count={1} />);

      const wrapper = container.firstChild as HTMLElement;
      const item = wrapper.firstChild as HTMLElement;

      expect(item.style.padding).toBe('1.5rem');
      // Colors are converted to RGB by the browser
      expect(item.style.border).toMatch(/1px solid (rgb\(224, 224, 224\)|#e0e0e0)/);
      expect(item.style.borderRadius).toBe('8px');
    });

    it('should render 3 skeleton divs per item', () => {
      const { container } = render(<SkeletonLoader count={1} />);

      const wrapper = container.firstChild as HTMLElement;
      const item = wrapper.firstChild as HTMLElement;
      const skeletonDivs = item.querySelectorAll('.skeleton');

      expect(skeletonDivs.length).toBe(3);
    });
  });

  describe('skeleton dimensions', () => {
    it('should have varying widths for skeleton elements', () => {
      const { container } = render(<SkeletonLoader count={1} />);

      const skeletonDivs = container.querySelectorAll('.skeleton');

      // First skeleton: 90% width, 1.5rem height
      expect((skeletonDivs[0] as HTMLElement).style.width).toBe('90%');
      expect((skeletonDivs[0] as HTMLElement).style.height).toBe('1.5rem');

      // Second skeleton: 70% width, 1rem height
      expect((skeletonDivs[1] as HTMLElement).style.width).toBe('70%');
      expect((skeletonDivs[1] as HTMLElement).style.height).toBe('1rem');

      // Third skeleton: 100% width, 2.5rem height
      expect((skeletonDivs[2] as HTMLElement).style.width).toBe('100%');
      expect((skeletonDivs[2] as HTMLElement).style.height).toBe('2.5rem');
    });
  });

  describe('unique keys', () => {
    it('should render items with unique keys without warnings', () => {
      // If keys were not unique, React would throw a warning
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(<SkeletonLoader count={5} />);

      // Check that no key-related warnings were logged
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('key')
      );

      consoleSpy.mockRestore();
    });
  });
});
