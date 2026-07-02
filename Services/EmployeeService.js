import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";

const SKILLS = [
  "Cutting",
  "Tailoring",
  "Design",
  "Packing",
  "Sales",
  "Finishing",
  "Embroidery",
];

const validateSkills = (skills) => {
  if (skills === undefined) return;
  if (!Array.isArray(skills)) {
    throw new AppError("skills must be an array", 400);
  }
  const invalid = skills.filter((s) => !SKILLS.includes(s));
  if (invalid.length) {
    throw new AppError(
      `Invalid skills: ${invalid.join(", ")}. Must be one of: ${SKILLS.join(", ")}`,
      400,
    );
  }
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
  const { name, phone, cnic, address, skills, salary, isActive } = data;

  if (!name || !phone) {
    throw new AppError("name and phone are required", 400);
  }
  validateSkills(skills);
  if (salary !== undefined && salary < 0) {
    throw new AppError("salary cannot be negative", 400);
  }

  return Employee.create({
    tenantId,
    name,
    phone,
    cnic,
    address,
    skills,
    salary,
    isActive,
    createdBy: userId,
    updatedBy: userId,
  });
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
  ];

  validateSkills(data.skills);
  if (data.salary !== undefined && data.salary < 0) {
    throw new AppError("salary cannot be negative", 400);
  }

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

export const deleteEmployee = async (tenantId, id, userId) => {
  const employee = await Employee.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
    { new: true },
  );
  if (!employee) throw new AppError("Employee not found", 404);
  return employee;
};
