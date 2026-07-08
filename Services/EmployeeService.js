import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Employee from "../Models/Employee.js";
import User from "../Models/User.js";
import Role from "../Models/Role.js";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import * as OrderItemAssignmentService from "./OrderItemAssignmentService.js";
import AppError from "../utils/AppError.js";
import EMPLOYEE_SKILLS from "../utils/skills.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateSkills = (skills) => {
  if (skills === undefined) return;
  if (!Array.isArray(skills)) {
    throw new AppError("skills must be an array", 400);
  }
  const invalid = skills.filter((s) => !EMPLOYEE_SKILLS.includes(s));
  if (invalid.length) {
    throw new AppError(
      `Invalid skills: ${invalid.join(", ")}. Must be one of: ${EMPLOYEE_SKILLS.join(", ")}`,
      400,
    );
  }
};

const validateRoleId = async (tenantId, roleId) => {
  if (roleId === undefined || roleId === null) return;
  const role = await Role.findOne({ _id: roleId, tenantId });
  if (!role) throw new AppError("Role not found for this tenant", 404);
};

export const listEmployees = async (tenantId) => {
  return Employee.find({ tenantId, isDeleted: false }).sort({ createdAt: -1 });
};

export const getEmployeeById = async (tenantId, id) => {
  const employee = await Employee.findOne({
    _id: id,
    tenantId,
    isDeleted: false,
  });
  if (!employee) throw new AppError("Employee not found", 404);
  return employee;
};

export const createEmployee = async (tenantId, data, userId) => {
  const { name, phone, cnic, address, skills, salary, isActive, roleId } = data;

  if (!name || !phone) {
    throw new AppError("name and phone are required", 400);
  }
  validateSkills(skills);
  if (salary !== undefined && salary < 0) {
    throw new AppError("salary cannot be negative", 400);
  }
  await validateRoleId(tenantId, roleId);

  return Employee.create({
    tenantId,
    name,
    phone,
    cnic,
    address,
    skills,
    salary,
    isActive,
    roleId: roleId || null,
    createdBy: userId,
    updatedBy: userId,
  });
};

// Creates the Employee profile and its portal login (User, role "employee") together.
// A profile with no login (or a login with no profile) would be a dangling half-state,
// so both writes happen in one transaction — this is the only way a tenant grants an
// employee access to the portal.
export const enrollEmployee = async (tenantId, data, userId) => {
  const { name, phone, cnic, address, skills, salary, isActive, email, password, roleId } = data;

  if (!name || !phone) {
    throw new AppError("name and phone are required", 400);
  }
  if (!email || !password) {
    throw new AppError("email and password are required to grant portal access", 400);
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new AppError("Invalid email format", 400);
  }
  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }
  validateSkills(skills);
  if (salary !== undefined && salary < 0) {
    throw new AppError("salary cannot be negative", 400);
  }
  await validateRoleId(tenantId, roleId);

  const existingUser = await User.findOne({ tenantId, email });
  if (existingUser) {
    throw new AppError("A user with this email already exists in your business", 409);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const [employee] = await Employee.create(
      [
        {
          tenantId,
          name,
          phone,
          cnic,
          address,
          skills,
          salary,
          isActive,
          roleId: roleId || null,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    const hashedPassword = await bcrypt.hash(password, 10);
    const [user] = await User.create(
      [
        {
          email,
          password: hashedPassword,
          role: "employee",
          tenantId,
          employeeId: employee._id,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    const { password: _password, ...userSansPassword } = user.toObject();
    return { employee, user: userSansPassword };
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      throw new AppError("A user with this email already exists in your business", 409);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

export const updateEmployee = async (tenantId, id, data, userId) => {
  const allowedFields = [
    "name",
    "phone",
    "cnic",
    "address",
    "skills",
    "salary",
    "isActive",
    "roleId",
  ];

  validateSkills(data.skills);
  if (data.salary !== undefined && data.salary < 0) {
    throw new AppError("salary cannot be negative", 400);
  }
  await validateRoleId(tenantId, data.roleId);

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  updates.updatedBy = userId;

  const employee = await Employee.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    updates,
    { new: true, runValidators: true },
  );
  if (!employee) throw new AppError("Employee not found", 404);
  return employee;
};

// Soft-deleting an employee must also revoke their portal access — otherwise a
// "removed" employee could still log in. Both updates happen in one transaction.
export const deleteEmployee = async (tenantId, id, userId) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const employee = await Employee.findOneAndUpdate(
      { _id: id, tenantId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
      { new: true, session },
    );
    if (!employee) throw new AppError("Employee not found", 404);

    await User.updateMany(
      { tenantId, employeeId: id },
      { status: "suspended" },
      { session },
    );

    await session.commitTransaction();
    return employee;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// Self-service "what can I do" lookup — backs the frontend Sidebar/dashboard.
// Always resolves (never throws) so a missing/unassigned role can't break the
// caller's own page render; authorize() is what actually enforces access.
export const getMyPermissions = async (tenantId, employeeId) => {
  const employee = await Employee.findOne({
    _id: employeeId,
    tenantId,
    isDeleted: false,
  }).populate("roleId");

  if (!employee || !employee.roleId) {
    return { roleId: null, roleName: null, permissions: null };
  }

  return {
    roleId: employee.roleId._id,
    roleName: employee.roleId.name,
    permissions: employee.roleId.permissions,
  };
};

// Thin wrapper — reuses OrderItemAssignmentService's own query rather than
// duplicating the filter logic.
export const getEmployeeAssignments = async (tenantId, id) => {
  await getEmployeeById(tenantId, id);
  return OrderItemAssignmentService.listOrderItemAssignments(tenantId, undefined, id);
};

export const getEmployeePerformance = async (tenantId, id) => {
  await getEmployeeById(tenantId, id);

  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const employeeObjectId = new mongoose.Types.ObjectId(id);

  const [statusCounts, avgResult] = await Promise.all([
    OrderItemAssignment.aggregate([
      { $match: { tenantId: tenantObjectId, employeeId: employeeObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    OrderItemAssignment.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
          employeeId: employeeObjectId,
          status: "completed",
          completedAt: { $ne: null },
        },
      },
      { $project: { durationMs: { $subtract: ["$completedAt", "$assignedAt"] } } },
      { $group: { _id: null, avgDurationMs: { $avg: "$durationMs" } } },
    ]),
  ]);

  const counts = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  return {
    pending: counts.pending || 0,
    in_progress: counts.in_progress || 0,
    completed: counts.completed || 0,
    reassigned: counts.reassigned || 0,
    averageCompletionMs: avgResult[0]?.avgDurationMs ?? null,
  };
};
