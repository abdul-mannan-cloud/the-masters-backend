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
        // Not authenticated (missing/expired/tampered token) — distinct from
        // "authenticated but not permitted" below. The frontend's axios
        // interceptor only clears the stored token and redirects to /login
        // on 401, so a stale token must surface as 401, not 403, or the
        // client is stuck resending the same dead token forever.
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      // super_admin is the platform operator account — it passes every
      // route's role check regardless of which roles were listed.
      const isSuperAdmin = user.role === "super_admin";
      if (!isSuperAdmin && allowedRoles.length && !allowedRoles.includes(user.role)) {
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
