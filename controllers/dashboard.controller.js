const db = require("../config/db");

// Get dashboard stats
const getDashboardStats = async (req, res) => {
    try {
        // Today's sales
        const [todaySales] = await db.query(`
            SELECT COALESCE(SUM(total), 0) as amount, COUNT(*) as count
            FROM sales_orders
            WHERE DATE(order_date) = CURDATE()
        `);

        // This month's sales
        const [monthSales] = await db.query(`
            SELECT COALESCE(SUM(total), 0) as amount, COUNT(*) as count
            FROM sales_orders
            WHERE MONTH(order_date) = MONTH(CURDATE()) 
            AND YEAR(order_date) = YEAR(CURDATE())
        `);

        // Pending orders
        const [pendingOrders] = await db.query(`
            SELECT COUNT(*) as count FROM sales_orders 
            WHERE status IN ('Pending', 'Confirmed', 'In Progress')
        `);

        // Total stock
        const [totalStock] = await db.query(`
            SELECT COALESCE(SUM(quantity), 0) as quantity,
                   COALESCE(SUM(quantity * unit_cost), 0) as value
            FROM current_stock
        `);

        // New leads
        const [newLeads] = await db.query(`
            SELECT COUNT(*) as count FROM leads 
            WHERE status = 'New'
            AND MONTH(created_at) = MONTH(CURDATE())
        `);

        // Pending quotations
        const [pendingQuotations] = await db.query(`
            SELECT COUNT(*) as count FROM quotations 
            WHERE status IN ('Draft', 'Pending Approval', 'Sent')
        `);

        // Outstanding receivables
        const [receivables] = await db.query(`
            SELECT COALESCE(SUM(balance), 0) as amount,
                   COUNT(*) as count
            FROM sales_invoices
            WHERE balance > 0
        `);

        // Low stock items
        const [lowStock] = await db.query(`
            SELECT COUNT(*) as count FROM (
                SELECT p.id, p.reorder_level, COALESCE(SUM(cs.quantity), 0) as available
                FROM products p
                LEFT JOIN current_stock cs ON p.id = cs.product_id
                WHERE p.is_active = TRUE AND p.reorder_level IS NOT NULL
                GROUP BY p.id, p.reorder_level
                HAVING available < p.reorder_level
            ) as low_stock_items
        `);

        // Pending QC
        const [pendingQC] = await db.query(`
            SELECT COUNT(*) as count FROM grn WHERE status = 'QC Pending'
        `);

        res.json({
            success: true,
            data: {
                todaySales: {
                    amount: parseFloat(todaySales[0].amount) || 0,
                    count: todaySales[0].count
                },
                monthSales: {
                    amount: parseFloat(monthSales[0].amount) || 0,
                    count: monthSales[0].count
                },
                pendingOrders: pendingOrders[0].count,
                totalStock: {
                    quantity: parseFloat(totalStock[0].quantity) || 0,
                    value: parseFloat(totalStock[0].value) || 0
                },
                newLeads: newLeads[0].count,
                pendingQuotations: pendingQuotations[0].count,
                receivables: {
                    amount: parseFloat(receivables[0].amount) || 0,
                    count: receivables[0].count
                },
                lowStockItems: lowStock[0].count,
                pendingQC: pendingQC[0].count
            }
        });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard stats",
            error: error.message
        });
    }
};

// Get recent activities
const getRecentActivities = async (req, res) => {
    try {
        const [quotations] = await db.query(`
            SELECT 'Quotation' as type, q.id, q.quotation_number as reference,
                   c.company_name as customer, q.total as amount, q.status, q.created_at
            FROM quotations q
            LEFT JOIN customers c ON q.customer_id = c.id
            ORDER BY q.created_at DESC LIMIT 5
        `);

        const [orders] = await db.query(`
            SELECT 'Sales Order' as type, so.id, so.order_number as reference,
                   c.company_name as customer, so.total as amount, so.status, so.created_at
            FROM sales_orders so
            LEFT JOIN customers c ON so.customer_id = c.id
            ORDER BY so.created_at DESC LIMIT 5
        `);

        const [payments] = await db.query(`
            SELECT 'Payment' as type, cp.id, cp.payment_number as reference,
                   c.company_name as customer, cp.amount, cp.status, cp.created_at
            FROM customer_payments cp
            LEFT JOIN customers c ON cp.customer_id = c.id
            ORDER BY cp.created_at DESC LIMIT 5
        `);

        const [leads] = await db.query(`
            SELECT 'Lead' as type, l.id, l.lead_number as reference,
                   l.company_name as customer, l.expected_value as amount, l.status, l.created_at
            FROM leads l
            ORDER BY l.created_at DESC LIMIT 5
        `);

        const activities = [...quotations, ...orders, ...payments, ...leads]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);

        res.json({
            success: true,
            data: activities
        });
    } catch (error) {
        console.error("Recent activities error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch activities",
            error: error.message
        });
    }
};

// Get sales chart data
const getSalesChart = async (req, res) => {
    try {
        const { period = "week" } = req.query;

        let sql;
        if (period === "week") {
            sql = `
                SELECT 
                    DATE_FORMAT(order_date, '%a') as label,
                    DATE(order_date) as date,
                    COALESCE(SUM(total), 0) as sales,
                    COUNT(*) as orders
                FROM sales_orders
                WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DATE(order_date), DATE_FORMAT(order_date, '%a')
                ORDER BY date
            `;
        } else if (period === "month") {
            sql = `
                SELECT 
                    DATE_FORMAT(order_date, '%d %b') as label,
                    DATE(order_date) as date,
                    COALESCE(SUM(total), 0) as sales,
                    COUNT(*) as orders
                FROM sales_orders
                WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY DATE(order_date), DATE_FORMAT(order_date, '%d %b')
                ORDER BY date
            `;
        } else {
            sql = `
                SELECT 
                    DATE_FORMAT(order_date, '%b %Y') as label,
                    MIN(DATE(order_date)) as date,
                    COALESCE(SUM(total), 0) as sales,
                    COUNT(*) as orders
                FROM sales_orders
                WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                GROUP BY DATE_FORMAT(order_date, '%b %Y')
                ORDER BY date
            `;
        }

        const [data] = await db.query(sql);

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Sales chart error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch chart data",
            error: error.message
        });
    }
};

// Get stock distribution
const getStockDistribution = async (req, res) => {
    try {
        const [distribution] = await db.query(`
            SELECT 
                p.name as product,
                COALESCE(SUM(cs.quantity), 0) as quantity
            FROM products p
            LEFT JOIN current_stock cs ON p.id = cs.product_id
            WHERE p.is_active = TRUE
            GROUP BY p.id, p.name
            HAVING quantity > 0
            ORDER BY quantity DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: distribution
        });
    } catch (error) {
        console.error("Stock distribution error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch distribution",
            error: error.message
        });
    }
};

module.exports = {
    getDashboardStats,
    getRecentActivities,
    getSalesChart,
    getStockDistribution
};