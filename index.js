import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import userRoutes from "./routes/User.js";
import customerRoutes from "./routes/Customer.js";
import orderRoutes from "./routes/Order.js";
import employeeRoutes from "./routes/Employee.js";
import measurementRoutes from "./routes/Measurements.js";
import notificationRoutes from "./routes/Notification.js";
import orderItemRoutes from "./routes/OrderItem.js";
import orderItemAssignmentRoutes from "./routes/OrderItemAssignment.js";
import paymentRoutes from "./routes/Payment.js";
import productTypeRoutes from "./routes/ProductType.js";
import settingsRoutes from "./routes/Settings.js";
import tenantRoutes from "./routes/Tenant.js";
import roleRoutes from "./routes/Role.js";
import dashboardRoutes from "./routes/Dashboard.js";
import inventoryRoutes from "./routes/Inventory.js";
import inventoryCategoryRoutes from "./routes/InventoryCategory.js";
import alertRoutes from "./routes/Alert.js";
import seedSuperAdmin from "./utils/seedSuperAdmin.js";
import { backfillRolesForExistingTenants } from "./utils/seedDefaultRoles.js";
import { backfillProductTypesForExistingTenants } from "./utils/seedDefaultProductTypes.js";
import { backfillInventoryForExistingTenants } from "./utils/seedDefaultInventory.js";
import { backfillInventoryCategories } from "./utils/backfillInventoryCategories.js";
import { backfillCustomerNumbers } from "./utils/backfillCustomerNumbers.js";
import { backfillTenantSoftDelete } from "./utils/backfillTenantSoftDelete.js";
import { backfillInventoryPermissions } from "./utils/backfillInventoryPermissions.js";
import { backfillInventoryTransactionSnapshots } from "./utils/backfillInventoryTransactionSnapshots.js";
import {
  backfillEmployeeRolePermissions,
  backfillEmployeeCreateAccess,
} from "./utils/backfillEmployeeRolePermissions.js";

// import clothRoutes from "./routes/Cloths.js";
// import productRoutes from "./routes/Product.js";
// import itemRoutes from "./routes/items.js";
// import searchRoutes from "./routes/search.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/assets", express.static(path.join(__dirname, "public/assets")));

app.use("/admin", userRoutes);
app.use("/customer", customerRoutes);
app.use("/order", orderRoutes);
app.use("/employee", employeeRoutes);
app.use("/measurement", measurementRoutes);
app.use("/notification", notificationRoutes);
app.use("/order-item", orderItemRoutes);
app.use("/order-item-assignment", orderItemAssignmentRoutes);
app.use("/payment", paymentRoutes);
app.use("/product-type", productTypeRoutes);
app.use("/settings", settingsRoutes);
app.use("/tenant", tenantRoutes);
app.use("/role", roleRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/inventory-category", inventoryCategoryRoutes);
app.use("/alert", alertRoutes);
// app.use("/cloth", clothRoutes);
// app.use("/product", productRoutes);
// app.use("/items", itemRoutes);
// app.use("/search", searchRoutes);

const DB = process.env.MONGO_URI || "mongodb://localhost:27017/digitalTailor";
const port = process.env.PORT || 3004;

mongoose
  .connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Database connected");
    await seedSuperAdmin();
    await backfillTenantSoftDelete();
    await backfillRolesForExistingTenants();
    await backfillProductTypesForExistingTenants();
    await backfillInventoryForExistingTenants();
    await backfillInventoryCategories();
    await backfillCustomerNumbers();
    await backfillInventoryPermissions();
    await backfillInventoryTransactionSnapshots();
    await backfillEmployeeRolePermissions();
    await backfillEmployeeCreateAccess();
    app.listen(port, () => {
      console.log(`App Listening at Port ${port}`);
    });
  })
  .catch((error) => console.log(error.message));
