import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../Models/User.js";
import dotenv from "dotenv";
dotenv.config();

const signup = async (req, res) => {
  try {
    const { email, password, role, tenantId, employeeId } = req.body;

    if (!email || !password || !role) {
      return res
        .status(400)
        .json({ error: "email, password, and role are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const validRoles = ["super_admin", "tenant_admin", "employee"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    const objectIdRegex = /^[a-f\d]{24}$/i;
    if (tenantId && !objectIdRegex.test(tenantId)) {
      return res.status(400).json({ error: "Invalid tenantId format" });
    }
    if (employeeId && !objectIdRegex.test(employeeId)) {
      return res.status(400).json({ error: "Invalid employeeId format" });
    }

    // Unique index is on { tenantId, email } — check must match that scope
    const existingUser = await User.findOne({
      email,
      tenantId: tenantId || null,
    });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      tenantId: tenantId || null,
      employeeId: employeeId || null,
    });

    return res.status(201).json({
      message: "User registered successfully.",
      user,
    });
  } catch (err) {
    console.error("Error during signup:", err);

    // Race condition: two requests passed the findOne check simultaneously
    if (err.code === 11000) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Mongoose schema validation failed (required field missing, bad enum value, etc.)
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    // Malformed ObjectId that bypassed the upfront regex (shouldn't happen, but safe to catch)
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ error: `Invalid value for field: ${err.path}` });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password, tenantId = null } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email, tenantId });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is not active" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, role: user.role, tenantId: user.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION },
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

async function getAllUsers(req, res) {
  try {
    // super_admin can see every tenant's users; everyone else only their own tenant's
    const filter =
      req.user.role === "super_admin" ? {} : { tenantId: req.user.tenantId };

    const users = await User.find(filter).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const objectIdRegex = /^[a-f\d]{24}$/i;
    if (!objectIdRegex.test(id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (
      req.user.role !== "super_admin" &&
      String(user.tenantId) !== String(req.user.tenantId)
    ) {
      return res.status(403).json({ error: "Access denied for this tenant" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

const createUser = async (req, res) => {
  try {
    const { email, password, role, employeeId, status } = req.body;
    let { tenantId } = req.body;

    if (!email || !password || !role) {
      return res
        .status(400)
        .json({ error: "email, password, and role are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const validRoles = ["super_admin", "tenant_admin", "manager", "employee"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    // A tenant-scoped admin/manager can only create users inside their own
    // tenant, and can never mint a super_admin account.
    if (req.user.role !== "super_admin") {
      if (role === "super_admin") {
        return res
          .status(403)
          .json({ error: "Access denied, insufficient permissions" });
      }
      tenantId = req.user.tenantId;
    }

    const validStatuses = ["active", "inactive", "suspended"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const objectIdRegex = /^[a-f\d]{24}$/i;
    if (tenantId && !objectIdRegex.test(String(tenantId))) {
      return res.status(400).json({ error: "Invalid tenantId format" });
    }
    if (employeeId && !objectIdRegex.test(employeeId)) {
      return res.status(400).json({ error: "Invalid employeeId format" });
    }

    const existingUser = await User.findOne({
      email,
      tenantId: tenantId || null,
    });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
      tenantId: tenantId || null,
      employeeId: employeeId || null,
      ...(status && { status }),
    });

    return res
      .status(201)
      .json({ message: "User created successfully.", user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "User already exists" });
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ error: `Invalid value for field: ${err.path}` });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const objectIdRegex = /^[a-f\d]{24}$/i;
    if (!objectIdRegex.test(id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    if (
      req.user.role !== "super_admin" &&
      String(targetUser.tenantId) !== String(req.user.tenantId)
    ) {
      return res.status(403).json({ error: "Access denied for this tenant" });
    }

    const { email, password, role, status, tenantId, employeeId } = req.body;

    // Only super_admin may reassign a user's tenant or grant super_admin
    if (req.user.role !== "super_admin") {
      if (tenantId !== undefined) {
        return res
          .status(403)
          .json({ error: "Access denied, insufficient permissions" });
      }
      if (role === "super_admin") {
        return res
          .status(403)
          .json({ error: "Access denied, insufficient permissions" });
      }
    }

    const updates = {};

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      updates.email = email;
    }

    if (password !== undefined) {
      if (password.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters" });
      }
      updates.password = await bcrypt.hash(password, 10);
    }

    if (role !== undefined) {
      const validRoles = ["super_admin", "tenant_admin", "manager", "employee"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        });
      }
      updates.role = role;
    }

    if (status !== undefined) {
      const validStatuses = ["active", "inactive", "suspended"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
      updates.status = status;
    }

    if (tenantId !== undefined) {
      if (tenantId !== null && !objectIdRegex.test(tenantId)) {
        return res.status(400).json({ error: "Invalid tenantId format" });
      }
      updates.tenantId = tenantId;
    }

    if (employeeId !== undefined) {
      if (employeeId !== null && !objectIdRegex.test(employeeId)) {
        return res.status(400).json({ error: "Invalid employeeId format" });
      }
      updates.employeeId = employeeId;
    }

    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res
      .status(200)
      .json({ message: "User updated successfully.", user });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ error: "Email already in use within this tenant" });
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ error: `Invalid value for field: ${err.path}` });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const objectIdRegex = /^[a-f\d]{24}$/i;
    if (!objectIdRegex.test(id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    if (
      req.user.role !== "super_admin" &&
      String(targetUser.tenantId) !== String(req.user.tenantId)
    ) {
      return res.status(403).json({ error: "Access denied for this tenant" });
    }

    await targetUser.deleteOne();

    return res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export {
  signup,
  login,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
