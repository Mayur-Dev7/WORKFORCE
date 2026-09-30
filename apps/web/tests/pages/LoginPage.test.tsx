import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../src/pages/auth/LoginPage.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('LoginPage Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('routes Super Admin to employee dashboard on successful login', async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      id: 'admin-id',
      name: 'Sarah Connor',
      role_name: 'SUPER_ADMIN',
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
      login: mockLogin,
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

    const sarahBtn = screen.getByText('Sarah Connor (Super Admin)');
    fireEvent.click(sarahBtn);

    const submitBtn = screen.getByRole('button', { name: /Sign In to Workplace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('EMP-001', 'Password123!');
      expect(mockNavigate).toHaveBeenCalledWith('/employee/dashboard', { replace: true });
    });
  });
});
