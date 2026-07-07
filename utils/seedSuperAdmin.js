import bcrypt from "bcrypt";
import User from "../Models/User.js";

// Ensures the platform operator account from admin_username/admin_password
// exists as a super_admin. Runs on every startup but only creates the user
// once — it never overwrites an existing account's password.
const seedSuperAdmin = async () => {
  const email = process.env.admin_username;
  const password = process.env.admin_password;
  if (!email || !password) return;

  const existing = await User.findOne({ email, tenantId: null });
  if (existing) return;

  const hashedPassword = await bcrypt.hash(password, 10);
  await User.create({
    email,
    password: hashedPassword,
    role: "super_admin",
    tenantId: null,
  });
  console.log(`Seeded super_admin account: ${email}`);
};

export default seedSuperAdmin;
