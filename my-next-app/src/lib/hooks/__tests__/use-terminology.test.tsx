/** @vitest-environment jsdom */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { TerminologyProvider, useTerminology } from '../use-terminology';

describe('useTerminology Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TerminologyProvider>{children}</TerminologyProvider>
  );

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should provide default standard translations', () => {
    const { result } = renderHook(() => useTerminology(), { wrapper });
    
    expect(result.current.mode).toBe('standard');
    expect(result.current.t('nav.home')).toBe('首页');
  });

  it('should switch mode and persist to localStorage', () => {
    const { result } = renderHook(() => useTerminology(), { wrapper });
    
    act(() => {
      result.current.setMode('neo-chinese');
    });
    
    expect(result.current.mode).toBe('neo-chinese');
    expect(result.current.t('nav.home')).toBe('修习');
    expect(localStorage.getItem('terminology-mode')).toBe('neo-chinese');
  });

  it('should initialize mode from localStorage', () => {
    localStorage.setItem('terminology-mode', 'neo-chinese');
    
    const { result } = renderHook(() => useTerminology(), { wrapper });
    
    // In useEffect on mount, it should pick up the saved mode
    expect(result.current.mode).toBe('neo-chinese');
    expect(result.current.t('nav.home')).toBe('修习');
  });

  it('should return the key if translation is missing', () => {
    const { result } = renderHook(() => useTerminology(), { wrapper });
    
    expect(result.current.t('unknown.key')).toBe('unknown.key');
  });

  it('should throw error if used outside of Provider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => renderHook(() => useTerminology())).toThrow('useTerminology must be used within a TerminologyProvider');
    
    spy.mockRestore();
  });
});
