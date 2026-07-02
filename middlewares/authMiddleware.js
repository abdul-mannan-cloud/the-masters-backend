import jwt from "jsonwebtoken";

const authentication = (...allowedRoles) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Extract token from Authorization header
    console.log("authenticating....");
    if (!token) {
      return res.status(401).json({ error: "Access denied, token missing" }); // If no token, return 401
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      // Verify the token
      if (err) {
        return res.status(403).json({ error: "Invalid token" }); // If token is invalid, return 403
      }
      if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        return res
          .status(403)
          .json({ error: "Access denied, insufficient permissions" }); // If user role is not allowed, return 403
      }
      req.user = user; // Attach user info to request object
      next(); // Proceed to the next middleware or route handler
    });
  };
};

export default authentication; // Export the authentication middleware
