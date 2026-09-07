const auth = require('./auth');

const admin = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ error: 'Admin access required' });
  });
};

module.exports = admin;
