// const express = require("express");
// const db = require("./config/db");

// require("dotenv").config();

// const app = express();

// app.use(express.json());

// app.get("/", (req, res) => {
//     res.json({
//         message: "Server is running"
//     });
// });

// app.get("/test-db", async (req, res) => {
//     try {
//         const [result] = await db.query("SELECT 1 AS result");

//         res.json({
//             success: true,
//             message: "MySQL connected successfully",
//             result
//         });
//     } catch (error) {
//         console.error(error);

//         res.status(500).json({
//             success: false,
//             message: "MySQL connection failed",
//             error: error.message
//         });
//     }
// });

// app.listen(5000, () => {
//     console.log("Server running on port 5000");
// });

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/db");

console.log("=== Environment Check ===");
console.log("JWT_SECRET loaded:", process.env.JWT_SECRET ? "YES ✅" : "NO ❌");
console.log("CORS_ORIGIN:", process.env.CORS_ORIGIN);
console.log("=========================");

const app = express();

// ✅ CORS FIX for multiple origins
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((o) => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log("❌ CORS blocked:", origin);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const productRoutes = require("./routes/product.routes");
const leadRoutes = require("./routes/lead.routes");
const customerRoutes = require("./routes/customer.routes");
const supplierRoutes = require("./routes/supplier.routes");
const quotationRoutes = require("./routes/quotation.routes");
const salesOrderRoutes = require("./routes/sales-order.routes");
const purchaseOrderRoutes = require("./routes/purchase-order.routes");
const grnRoutes = require("./routes/grn.routes");
const qcRoutes = require("./routes/qc.routes");
const stockRoutes = require("./routes/stock.routes");
const invoiceRoutes = require("./routes/invoice.routes");
const paymentRoutes = require("./routes/payment.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const reportRoutes = require("./routes/report.routes");
const enquiryRoutes = require("./routes/enquiry.routes");

// Base routes
app.get("/", (req, res) => {
    res.json({ success: true, message: "Makhana ERP API is running" });
});

app.get("/test-db", async (req, res) => {
    try {
        const [result] = await db.query("SELECT 1 AS result");
        res.json({ success: true, message: "MySQL connected", result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/sales-orders", salesOrderRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/grn", grnRoutes);
app.use("/api/qc", qcRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/enquiries", enquiryRoutes);

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 API URL: http://localhost:${PORT}/api`);
    console.log(`✅ Allowed CORS origins:`, allowedOrigins);
});