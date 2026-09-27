import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock matchMedia for Ant Design responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock navigator.mediaDevices.getUserMedia
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: {},
  });
}

navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [
    {
      stop: vi.fn(),
      kind: 'video',
    },
  ],
});

// Mock navigator.geolocation
Object.defineProperty(navigator, 'geolocation', {
  writable: true,
  value: {
    getCurrentPosition: vi.fn().mockImplementation((success) => {
      success({
        coords: {
          latitude: 37.774929,
          longitude: -122.419416,
          accuracy: 15,
        },
      });
    }),
  },
});
