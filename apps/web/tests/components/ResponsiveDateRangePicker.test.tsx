import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import { ResponsiveDateRangePicker } from '../../src/components/common/ResponsiveDateRangePicker.js';

describe('ResponsiveDateRangePicker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders read-only button trigger on mobile without any input elements', () => {
    // Simulate mobile viewport
    window.innerWidth = 400;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <ResponsiveDateRangePicker
        value={null}
        onChange={vi.fn()}
      />
    );

    // Verify there are NO input elements in mobile mode (prevents keyboard popup on Android)
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBe(0);

    // Verify accessible role="button" trigger is rendered
    const trigger = screen.getByRole('button', { name: /Date Range/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('Start date')).toBeInTheDocument();
    expect(screen.getByText('End date')).toBeInTheDocument();
  });

  it('opens dedicated mobile calendar modal on tap without opening keyboard', () => {
    window.innerWidth = 400;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const handleChange = vi.fn();
    render(
      <ResponsiveDateRangePicker
        value={null}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Date Range/i });
    fireEvent.click(trigger);

    // Modal should now be open
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
    expect(screen.getByText('Apply / Done')).toBeInTheDocument();

    // Verify Apply button is disabled initially when no dates are selected
    const applyBtn = screen.getByRole('button', { name: /Apply/i });
    expect(applyBtn).toBeDisabled();
  });

  it('allows selecting start date and end date and committing on Apply', () => {
    window.innerWidth = 400;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const handleChange = vi.fn();
    const testDateStart = dayjs().startOf('month').add(10, 'day'); // 11th
    const testDateEnd = dayjs().startOf('month').add(14, 'day'); // 15th

    render(
      <ResponsiveDateRangePicker
        value={[testDateStart, testDateEnd]}
        onChange={handleChange}
      />
    );

    // Displays formatted dates in the trigger
    expect(screen.getByText(testDateStart.format('DD MMM YYYY'))).toBeInTheDocument();
    expect(screen.getByText(testDateEnd.format('DD MMM YYYY'))).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Date Range/i });
    fireEvent.click(trigger);

    // Apply button should be enabled because both dates exist
    const applyBtn = screen.getByRole('button', { name: /Apply \(5d\)/i });
    expect(applyBtn).not.toBeDisabled();

    fireEvent.click(applyBtn);
    expect(handleChange).toHaveBeenCalledWith([testDateStart, testDateEnd]);
  });
});
