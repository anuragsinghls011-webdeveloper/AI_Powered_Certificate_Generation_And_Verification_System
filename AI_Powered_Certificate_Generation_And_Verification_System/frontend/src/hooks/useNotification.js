import { useState, useCallback } from 'react';

/**
 * Custom hook for toast notification state management.
 * Replaces the inline useState + setTimeout pattern from the old App.js.
 */
export default function useNotification() {
  const [notification, setNotification] = useState({ message: '', type: '' });

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 4000);
  }, []);

  return { notification, showNotification };
}
