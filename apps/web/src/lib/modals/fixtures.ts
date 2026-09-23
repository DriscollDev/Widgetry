// Filler content for the ErrorModal sandbox preview.

import type { ErrorModalContent } from './errors';

export const connectionErrorFixture: ErrorModalContent = {
  title: 'Error Connecting',
  category: 'Connection',
  message:
    'There has been an error connecting to the service you have provided. Please double check the endpoint and authentication token used. If correct, try once again.',
  details: [
    { label: 'Error Code', value: 'AUTH_FAIL' },
    { label: 'Endpoint', value: 'api.example.com/v1/widgets' },
    { label: 'Attempted at', value: '2026-08-26 14:32:05' },
  ],
  retryLabel: 'Retry Connection',
};
