/**
 * Accessibility Utilities
 * 
 * Helper functions and constants for WCAG 2.1 AA compliance.
 * Ensures consistent accessibility patterns across the application.
 */

/**
 * Common ARIA labels for icon-only buttons
 * Prevents screen reader users from encountering unlabeled buttons
 */
export const ARIA_LABELS = {
  // Navigation
  CLOSE: 'Close',
  MENU: 'Open menu',
  BACK: 'Go back',
  
  // Actions
  COPY: 'Copy to clipboard',
  SHARE: 'Share market',
  REMOVE: 'Remove',
  DELETE: 'Delete',
  EDIT: 'Edit',
  SUBMIT: 'Submit',
  CANCEL: 'Cancel',
  
  // Theme
  TOGGLE_THEME: 'Toggle dark/light theme',
  
  // Wallet
  CONNECT_WALLET: 'Connect wallet',
  DISCONNECT_WALLET: 'Disconnect wallet',
  
  // Betting
  ADD_BET: 'Add bet to slip',
  REMOVE_BET: 'Remove bet from slip',
  CLEAR_BETS: 'Clear all bets',
  
  // Market
  VIEW_MARKET: 'View market details',
  RESOLVE_MARKET: 'Resolve market',
  
  // Notifications
  CLOSE_NOTIFICATION: 'Close notification',
  CLEAR_NOTIFICATIONS: 'Clear all notifications',
  
  // Help
  HELP: 'Help and information',
  INFO: 'More information',
} as const;

/**
 * Minimum color contrast ratios for WCAG 2.1 AA
 * - Normal text: 4.5:1
 * - Large text (18pt+): 3:1
 * - UI components: 3:1
 */
export const CONTRAST_RATIOS = {
  NORMAL_TEXT: 4.5,
  LARGE_TEXT: 3,
  UI_COMPONENT: 3,
} as const;

/**
 * Focus management utilities
 */
export const focusUtils = {
  /**
   * Trap focus within a modal or dialog
   * Prevents keyboard navigation from escaping the modal
   */
  trapFocus: (element: HTMLElement, initialFocus?: HTMLElement) => {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    (initialFocus || firstElement)?.focus();
    element.addEventListener('keydown', handleKeyDown);

    return () => element.removeEventListener('keydown', handleKeyDown);
  },

  /**
   * Restore focus to a previously focused element
   * Useful when closing modals or drawers
   */
  restoreFocus: (previousFocus: HTMLElement | null) => {
    if (previousFocus && previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
  },
};

/**
 * Keyboard event utilities
 */
export const keyboardUtils = {
  /**
   * Check if a keyboard event is an activation key (Enter or Space)
   * Used for custom button implementations
   */
  isActivationKey: (e: React.KeyboardEvent): boolean => {
    return e.key === 'Enter' || e.key === ' ';
  },

  /**
   * Check if Escape key was pressed
   * Used for closing modals and dropdowns
   */
  isEscapeKey: (e: React.KeyboardEvent): boolean => {
    return e.key === 'Escape';
  },

  /**
   * Check if arrow keys were pressed
   * Used for custom select and menu implementations
   */
  isArrowKey: (e: React.KeyboardEvent): boolean => {
    return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
  },
};

/**
 * ARIA live region utilities
 * Used for announcing dynamic content changes to screen readers
 */
export const liveRegionUtils = {
  /**
   * Announce a message to screen readers
   * Useful for form validation, success messages, etc.
   */
  announce: (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.textContent = message;
    document.body.appendChild(region);

    // Remove after announcement
    setTimeout(() => region.remove(), 1000);
  },
};

/**
 * Form accessibility utilities
 */
export const formUtils = {
  /**
   * Generate a unique ID for form inputs and labels
   * Ensures proper label-input association
   */
  generateId: (prefix: string): string => {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Get error message for screen readers
   * Combines field name with error description
   */
  getErrorMessage: (fieldName: string, error: string): string => {
    return `${fieldName}: ${error}`;
  },
};

/**
 * Color contrast checker (basic implementation)
 * For production, use a library like polished or tinycolor
 */
export const contrastUtils = {
  /**
   * Calculate relative luminance of a color
   * Used for WCAG contrast ratio calculation
   */
  getLuminance: (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  },

  /**
   * Calculate contrast ratio between two colors
   * Returns ratio as a number (e.g., 4.5 for 4.5:1)
   */
  getContrastRatio: (
    rgb1: [number, number, number],
    rgb2: [number, number, number]
  ): number => {
    const l1 = contrastUtils.getLuminance(...rgb1);
    const l2 = contrastUtils.getLuminance(...rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  },
};
