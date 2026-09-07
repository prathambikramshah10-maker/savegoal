const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((d) => d.message);
      return res.status(400).json({ error: errors[0], errors });
    }
    next();
  };
};

const registerSchema = (data) => {
  const errors = [];
  if (!data.name || data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }
  if (!data.email || !/^\S+@\S+\.\S+$/.test(data.email)) {
    errors.push('Valid email is required');
  }
  if (!data.phone || !/^[\d+\-\s]{7,20}$/.test(data.phone)) {
    errors.push('Valid phone number is required');
  }
  if (!data.password || data.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) {
    errors.push('Passwords do not match');
  }
  return errors;
};

const loginSchema = (data) => {
  const errors = [];
  if (!data.email || !/^\S+@\S+\.\S+$/.test(data.email)) {
    errors.push('Valid email is required');
  }
  if (!data.password) {
    errors.push('Password is required');
  }
  return errors;
};

const goalSchema = (data) => {
  const errors = [];
  if (!data.name || data.name.trim().length < 1) {
    errors.push('Goal name is required');
  }
  if (!data.targetAmount || data.targetAmount <= 0) {
    errors.push('Target amount must be greater than 0');
  }
  if (data.currentAmount !== undefined && data.currentAmount < 0) {
    errors.push('Starting amount cannot be negative');
  }
  if (!data.targetDate) {
    errors.push('Target date is required');
  }
  const validCategories = [
    'Emergency Fund', 'Education', 'Travel', 'Phone',
    'Laptop', 'Car', 'House', 'Other'
  ];
  if (!data.category || !validCategories.includes(data.category)) {
    errors.push('Valid category is required');
  }
  return errors;
};

const savingsSchema = (data) => {
  const errors = [];
  if (!data.amount || data.amount <= 0) {
    errors.push('Amount must be greater than 0');
  }
  return errors;
};

module.exports = { validate, registerSchema, loginSchema, goalSchema, savingsSchema };
