import React, { lazy } from 'react';

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (firstErr) {
      await new Promise((r) => setTimeout(r, 350));
      try {
        return await importer();
      } catch {
        throw firstErr;
      }
    }
  });
}
