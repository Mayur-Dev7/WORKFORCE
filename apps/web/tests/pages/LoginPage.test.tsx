import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../src/pages/auth/LoginPage.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';

describe('LoginPage Component Tests', () => {
  it('renders login form elements and quick-fill buttons', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn(),
      hasAnyPermission: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Workforce Access Portal')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/EMP-101/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Workplace/i })).toBeInTheDocument();
    expect(screen.getByText('Alex Mercer (Face Enrolled Employee)')).toBeInTheDocument();
  });

  it('populates fields when a quick-fill demo button is clicked', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const alexBtn = screen.getByText('Alex Mercer (Face Enrolled Employee)');
    fireEvent.click(alexBtn);

    const input = screen.getByPlaceholderText(/EMP-101/i) as HTMLInputElement;
    expect(input.value).toBe('EMP-101');
  });
});
