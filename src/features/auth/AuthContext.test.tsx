import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import React from 'react';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn()
    }
  }
}));

describe('AuthContext', () => {
  it('should initially set loading to true and user/profile to null', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });
});
