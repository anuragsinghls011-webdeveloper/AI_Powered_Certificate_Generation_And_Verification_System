import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import { useAuth } from './AuthContext';
import axios from '../services/api';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/api', () => ({ __esModule: true, default: { post: jest.fn() }, API: '/api' }));

test.each([
  ['/auth/reset-password?token=sample', 'reset-form'],
  ['/auth/forgot-password', 'forgot-form']
])('a signed-in visitor can open %s', async (path, formId) => {
  useAuth.mockReturnValue({ user: { id: 'signed-in' }, membership: null, loading: false });
  window.history.replaceState(null, '', path);
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<App />); });
    const form = host.querySelector(`[data-testid="${formId}"]`);
    expect(form).toBeTruthy();
    if (formId === 'reset-form') {
      const password = form.querySelector('input');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(password, 'Changed123');
        password.dispatchEvent(new Event('input', { bubbles: true }));
      });
      axios.post.mockResolvedValueOnce({ data: { message: 'Password reset.' } });
      await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      expect(axios.post).toHaveBeenCalledWith('/api/auth/reset-password', { token: 'sample', new_password: 'Changed123' });
      expect(host.querySelector('a[href="/auth/login"]')).toBeTruthy();
      expect(window.location.search).toBe('');
    }
  } finally {
    act(() => root.unmount());
    window.history.replaceState(null, '', '/');
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
