/**
 * Tests for LanguageSelector component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSelector from '../LanguageSelector';

describe('LanguageSelector', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render all 6 language options', () => {
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(6);
    });

    it('should display language names', () => {
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      expect(screen.getByText('עברית')).toBeInTheDocument();
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('العربية')).toBeInTheDocument();
      expect(screen.getByText('Deutsch')).toBeInTheDocument();
      expect(screen.getByText('Español')).toBeInTheDocument();
      expect(screen.getByText('Nederlands')).toBeInTheDocument();
    });

    it('should display RTL badge for Hebrew and Arabic', () => {
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      const rtlBadges = screen.getAllByText('RTL');
      expect(rtlBadges).toHaveLength(2); // Hebrew and Arabic
    });

    it('should display Active badge for selected language', () => {
      render(<LanguageSelector currentLanguage="en" onChange={mockOnChange} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should not display Active badge when no language selected', () => {
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should mark selected language with aria-pressed', () => {
      render(<LanguageSelector currentLanguage="en" onChange={mockOnChange} />);

      const englishButton = screen.getByRole('button', { name: /English/i });
      expect(englishButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should mark non-selected languages with aria-pressed false', () => {
      render(<LanguageSelector currentLanguage="en" onChange={mockOnChange} />);

      const hebrewButton = screen.getByRole('button', { name: /עברית/i });
      expect(hebrewButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('should apply selected class to current language', () => {
      const { container } = render(
        <LanguageSelector currentLanguage="en" onChange={mockOnChange} />
      );

      const selectedCards = container.querySelectorAll('.languageCardSelected');
      expect(selectedCards).toHaveLength(1);
    });
  });

  describe('interaction', () => {
    it('should call onChange with language code when clicking unselected language', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /English/i }));

      expect(mockOnChange).toHaveBeenCalledWith('en');
    });

    it('should call onChange with empty string when clicking selected language (toggle off)', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage="en" onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /English/i }));

      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('should call onChange with new language when switching from one to another', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage="en" onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /Deutsch/i }));

      expect(mockOnChange).toHaveBeenCalledWith('de');
    });

    it('should select Hebrew', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /עברית/i }));

      expect(mockOnChange).toHaveBeenCalledWith('he');
    });

    it('should select Arabic', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /العربية/i }));

      expect(mockOnChange).toHaveBeenCalledWith('ar');
    });

    it('should select Spanish', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /Español/i }));

      expect(mockOnChange).toHaveBeenCalledWith('es');
    });

    it('should select Dutch', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      await user.click(screen.getByRole('button', { name: /Nederlands/i }));

      expect(mockOnChange).toHaveBeenCalledWith('nl');
    });
  });

  describe('accessibility', () => {
    it('should have accessible labels for all buttons', () => {
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      // Each button should have an aria-label
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label');
        expect(button.getAttribute('aria-label')).toMatch(/Select/);
      });
    });

    it('should have type="button" to prevent form submission', () => {
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty string currentLanguage', () => {
      render(<LanguageSelector currentLanguage="" onChange={mockOnChange} />);

      // No language should be selected
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('should handle rapid clicks', async () => {
      const user = userEvent.setup();
      render(<LanguageSelector currentLanguage={undefined} onChange={mockOnChange} />);

      const button = screen.getByRole('button', { name: /English/i });
      await user.click(button);
      await user.click(button);
      await user.click(button);

      expect(mockOnChange).toHaveBeenCalledTimes(3);
    });
  });
});
