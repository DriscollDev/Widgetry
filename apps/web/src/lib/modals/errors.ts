// Shape every error in the app is normalized to before it reaches
// ErrorModal. One shape in, one modal renders it - callers don't each
// invent their own error dialog markup.

export type ErrorDetail = {
  label: string;
  value: string;
};

export type ErrorModalContent = {
  title: string;
  category: string;
  message: string;
  details: ErrorDetail[];
  retryLabel: string;
};
