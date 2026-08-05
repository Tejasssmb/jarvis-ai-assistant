const jwt = require("jsonwebtoken");

function generateUserToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
}

function verifyUserToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  generateUserToken,
  verifyUserToken,
};