import { resolve } from 'path';

// This file is emitted to apps/api/src or apps/api/dist at runtime.
export const DEFAULT_WEB_DIST_PATH = resolve(__dirname, '..', '..', 'web', 'dist');
