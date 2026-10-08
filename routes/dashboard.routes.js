const express = require("express");
const {
    getDashboardStats,
    getRecentActivities,
    getSalesChart,
    getStockDistribution
} = require("../controllers/dashboard.controller");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/stats", getDashboardStats);
router.get("/activities", getRecentActivities);
router.get("/sales-chart", getSalesChart);
router.get("/stock-distribution", getStockDistribution);

module.exports = router;