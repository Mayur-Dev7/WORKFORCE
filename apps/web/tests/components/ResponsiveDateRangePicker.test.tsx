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

  it('adjusts end date when End Date card is active and a date after start is tapped', () => {
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
    // Using current month: 15th to 17th
    const currentMonth = dayjs().startOf('month');
    const d15 = currentMonth.date(15);
    const d17 = currentMonth.date(17);
    const d18 = currentMonth.date(18);

    render(
      <ResponsiveDateRangePicker
        value={[d15, d17]}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Date Range/i });
    fireEvent.click(trigger);

    // Make End Date card active as stated in the scenario
    const endCard = screen.getByText('End Date');
    fireEvent.click(endCard);

    // Tapping 18 when End card is active should adjust End to 18 (Start remains 15)
    const day18Btn = screen.getByRole('button', { name: new RegExp(d18.format('DD MMMM YYYY'), 'i') });
    fireEvent.click(day18Btn);

    // Should now show 4 days (15th to 18th)
    const applyBtn = screen.getByRole('button', { name: /Apply \(4d\)/i });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);

    expect(handleChange).toHaveBeenCalledWith([d15, d18]);
  });

  it('adjusts start date when Start Date card is clicked and an earlier date is tapped', () => {
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
    const currentMonth = dayjs().startOf('month');
    const d15 = currentMonth.date(15);
    const d17 = currentMonth.date(17);
    const d14 = currentMonth.date(14);

    render(
      <ResponsiveDateRangePicker
        value={[d15, d17]}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Date Range/i });
    fireEvent.click(trigger);

    // Click Start Date card
    const startCard = screen.getByText('Start Date');
    fireEvent.click(startCard);

    // Tap 14
    const day14Btn = screen.getByRole('button', { name: new RegExp(d14.format('DD MMMM YYYY'), 'i') });
    fireEvent.click(day14Btn);

    // Start becomes 14, End remains 17 (4 days: 14 to 17)
    const applyBtn = screen.getByRole('button', { name: /Apply \(4d\)/i });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);

    expect(handleChange).toHaveBeenCalledWith([d14, d17]);
  });
});
