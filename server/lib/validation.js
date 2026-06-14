const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateRegistration({ name, email, password }) {
  const errors = {};
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');

  if (cleanName.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  }

  if (!emailPattern.test(cleanEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (cleanPassword.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  } else if (!/[A-Za-z]/.test(cleanPassword) || !/\d/.test(cleanPassword)) {
    errors.password = 'Password must contain at least one letter and one number.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      name: cleanName,
      email: cleanEmail,
      password: cleanPassword
    }
  };
}

export function validateLogin({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');
  const errors = {};

  if (!emailPattern.test(cleanEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!cleanPassword) {
    errors.password = 'Password is required.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      email: cleanEmail,
      password: cleanPassword
    }
  };
}
