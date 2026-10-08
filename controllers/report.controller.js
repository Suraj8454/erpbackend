const db = require("../config/db");

// ============================================
// SALES REPORTS
// ============================================

const getSalesSummary = async (req, res) => {
    try {
        const { from_date, to_date, customer_id, salesperson_id } = req.query;

        let sql = `
            SELECT 
                DATE(so.order_date) as date,
                COUNT(DISTINCT so.id) as total_orders,
                COALESCE(SUM(so.total), 0) as total_sales,
                COALESCE(SUM(so.subtotal), 0) as subtotal,
                COALESCE(SUM(so.tax), 0) as total_tax,
                COALESCE(SUM(so.discount), 0) as total_discount
            FROM sales_orders so
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(so.order_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(so.order_date) <= ?";
            params.push(to_date);
        }
        if (customer_id) {
            sql += " AND so.customer_id = ?";
            params.push(customer_id);
        }
        if (salesperson_id) {
            sql += " AND so.salesperson_id = ?";
            params.push(salesperson_id);
        }

        sql += " GROUP BY DATE(so.order_date) ORDER BY date DESC";

        const [data] = await db.query(sql, params);

        const totals = data.reduce(
            (acc, row) => ({
                totalOrders: acc.totalOrders + Number(row.total_orders || 0),
                totalSales: acc.totalSales + Number(row.total_sales || 0),
                totalTax: acc.totalTax + Number(row.total_tax || 0),
                totalDiscount: acc.totalDiscount + Number(row.total_discount || 0),
            }),
            { totalOrders: 0, totalSales: 0, totalTax: 0, totalDiscount: 0 }
        );

        res.json({
            success: true,
            data: {
                rows: data,
                ...totals,
            },
        });
    } catch (error) {
        console.error("Sales summary error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch sales summary",
            error: error.message,
        });
    }
};

const getSalesByCustomer = async (req, res) => {
    try {
        const { from_date, to_date, limit = 50 } = req.query;

        let sql = `
            SELECT 
                c.id, 
                c.customer_code, 
                c.company_name,
                COUNT(DISTINCT so.id) as total_orders,
                COALESCE(SUM(so.total), 0) as total_sales,
                COALESCE((
                    SELECT SUM(si.paid_amount) 
                    FROM sales_invoices si 
                    WHERE si.customer_id = c.id
                ), 0) as total_paid,
                COALESCE((
                    SELECT SUM(si.balance) 
                    FROM sales_invoices si 
                    WHERE si.customer_id = c.id
                ), 0) as outstanding
            FROM customers c
            INNER JOIN sales_orders so ON c.id = so.customer_id
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(so.order_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(so.order_date) <= ?";
            params.push(to_date);
        }

        sql += `
            GROUP BY c.id, c.customer_code, c.company_name
            ORDER BY total_sales DESC
            LIMIT ?
        `;
        params.push(parseInt(limit));

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Sales by customer error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getSalesByProduct = async (req, res) => {
    try {
        const { from_date, to_date, limit = 50 } = req.query;

        let sql = `
            SELECT 
                p.id, 
                p.code, 
                p.name,
                p.unit,
                COUNT(DISTINCT soi.sales_order_id) as total_orders,
                COALESCE(SUM(soi.quantity), 0) as total_quantity,
                COALESCE(SUM(soi.total), 0) as total_sales,
                COALESCE(AVG(soi.rate), 0) as avg_rate
            FROM products p
            INNER JOIN sales_order_items soi ON p.id = soi.product_id
            INNER JOIN sales_orders so ON soi.sales_order_id = so.id
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(so.order_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(so.order_date) <= ?";
            params.push(to_date);
        }

        sql += `
            GROUP BY p.id, p.code, p.name, p.unit
            ORDER BY total_sales DESC
            LIMIT ?
        `;
        params.push(parseInt(limit));

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Sales by product error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getSalesBySalesperson = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        let sql = `
            SELECT 
                u.id, 
                u.first_name, 
                u.last_name, 
                u.email,
                COUNT(DISTINCT so.id) as total_orders,
                COALESCE(SUM(so.total), 0) as total_sales,
                COALESCE(AVG(so.total), 0) as avg_order_value
            FROM users u
            INNER JOIN sales_orders so ON u.id = so.salesperson_id
            WHERE u.role IN ('salesperson', 'sales_manager', 'admin')
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(so.order_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(so.order_date) <= ?";
            params.push(to_date);
        }

        sql += `
            GROUP BY u.id, u.first_name, u.last_name, u.email
            ORDER BY total_sales DESC
        `;

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Sales by salesperson error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getCustomerOutstanding = async (req, res) => {
    try {
        const [data] = await db.query(`
            SELECT 
                c.id, 
                c.customer_code, 
                c.company_name, 
                c.mobile,
                COUNT(si.id) as total_invoices,
                COALESCE(SUM(si.total), 0) as total_invoiced,
                COALESCE(SUM(si.paid_amount), 0) as total_paid,
                COALESCE(SUM(si.balance), 0) as total_outstanding,
                SUM(CASE WHEN DATEDIFF(CURDATE(), si.due_date) BETWEEN 0 AND 30 THEN si.balance ELSE 0 END) as days_1_30,
                SUM(CASE WHEN DATEDIFF(CURDATE(), si.due_date) BETWEEN 31 AND 60 THEN si.balance ELSE 0 END) as days_31_60,
                SUM(CASE WHEN DATEDIFF(CURDATE(), si.due_date) > 60 THEN si.balance ELSE 0 END) as days_60_plus
            FROM customers c
            INNER JOIN sales_invoices si ON c.id = si.customer_id
            WHERE si.balance > 0
            GROUP BY c.id, c.customer_code, c.company_name, c.mobile
            ORDER BY total_outstanding DESC
        `);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Outstanding report error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};
// ============================================
// PURCHASE REPORTS
// ============================================

const getPurchaseSummary = async (req, res) => {
    try {
        const { from_date, to_date, supplier_id } = req.query;

        let sql = `
            SELECT 
                DATE(po.po_date) as date,
                COUNT(DISTINCT po.id) as total_orders,
                COALESCE(SUM(po.total), 0) as total_purchase,
                COALESCE(SUM(po.subtotal), 0) as subtotal,
                COALESCE(SUM(po.discount), 0) as total_discount
            FROM purchase_orders po
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(po.po_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(po.po_date) <= ?";
            params.push(to_date);
        }
        if (supplier_id) {
            sql += " AND po.supplier_id = ?";
            params.push(supplier_id);
        }

        sql += " GROUP BY DATE(po.po_date) ORDER BY date DESC";

        const [data] = await db.query(sql, params);

        const totals = data.reduce(
            (acc, row) => ({
                totalOrders: acc.totalOrders + Number(row.total_orders || 0),
                totalPurchase: acc.totalPurchase + Number(row.total_purchase || 0),
                totalDiscount: acc.totalDiscount + Number(row.total_discount || 0),
            }),
            { totalOrders: 0, totalPurchase: 0, totalDiscount: 0 }
        );

        res.json({ success: true, data: { rows: data, ...totals } });
    } catch (error) {
        console.error("Purchase summary error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getPurchaseBySupplier = async (req, res) => {
    try {
        const { from_date, to_date, limit = 50 } = req.query;

        let sql = `
            SELECT 
                s.id, 
                s.supplier_code, 
                s.company_name, 
                s.mobile,
                COUNT(DISTINCT po.id) as total_orders,
                COALESCE(SUM(po.total), 0) as total_purchase,
                COALESCE(AVG(po.total), 0) as avg_order_value
            FROM suppliers s
            INNER JOIN purchase_orders po ON s.id = po.supplier_id
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(po.po_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(po.po_date) <= ?";
            params.push(to_date);
        }

        sql += `
            GROUP BY s.id, s.supplier_code, s.company_name, s.mobile
            ORDER BY total_purchase DESC
            LIMIT ?
        `;
        params.push(parseInt(limit));

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Purchase by supplier error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getPurchasePriceHistory = async (req, res) => {
    try {
        const { product_id } = req.query;

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required",
            });
        }

        const [data] = await db.query(
            `
            SELECT 
                po.po_date,
                po.po_number,
                s.company_name as supplier_name,
                poi.quantity,
                poi.rate,
                poi.total,
                poi.unit
            FROM purchase_order_items poi
            INNER JOIN purchase_orders po ON poi.purchase_order_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE poi.product_id = ?
            ORDER BY po.po_date DESC
            LIMIT 100
        `,
            [product_id]
        );

        res.json({ success: true, data });
    } catch (error) {
        console.error("Price history error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

// ============================================
// STOCK REPORTS
// ============================================

const getStockReport = async (req, res) => {
    try {
        const { warehouse_id } = req.query;

        let sql = `
            SELECT 
                p.id, 
                p.code, 
                p.name, 
                p.unit,
                COALESCE(SUM(cs.quantity), 0) as total_quantity,
                COALESCE(SUM(cs.reserved_quantity), 0) as reserved_quantity,
                COALESCE(SUM(cs.hold_quantity), 0) as hold_quantity,
                COALESCE(SUM(cs.quantity * cs.unit_cost), 0) as stock_value
            FROM products p
            LEFT JOIN current_stock cs ON p.id = cs.product_id
            WHERE p.is_active = TRUE
        `;
        const params = [];

        if (warehouse_id) {
            sql += " AND cs.warehouse_id = ?";
            params.push(warehouse_id);
        }

        sql += `
            GROUP BY p.id, p.code, p.name, p.unit
            ORDER BY p.name
        `;

        const [data] = await db.query(sql, params);

        const totals = data.reduce(
            (acc, row) => ({
                totalQuantity: acc.totalQuantity + Number(row.total_quantity || 0),
                totalValue: acc.totalValue + Number(row.stock_value || 0),
            }),
            { totalQuantity: 0, totalValue: 0 }
        );

        res.json({ success: true, data: { rows: data, ...totals } });
    } catch (error) {
        console.error("Stock report error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getStockMovement = async (req, res) => {
    try {
        const { from_date, to_date, product_id } = req.query;

        let sql = `
            SELECT 
                sl.transaction_date,
                sl.transaction_type,
                sl.reference_number,
                p.name as product_name,
                p.code as product_code,
                sl.quantity_in,
                sl.quantity_out,
                sl.balance,
                sl.batch_number
            FROM stock_ledger sl
            LEFT JOIN products p ON sl.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(sl.transaction_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(sl.transaction_date) <= ?";
            params.push(to_date);
        }
        if (product_id) {
            sql += " AND sl.product_id = ?";
            params.push(product_id);
        }

        sql += " ORDER BY sl.transaction_date DESC LIMIT 500";

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Stock movement error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getLowStockReport = async (req, res) => {
    try {
        const [data] = await db.query(`
            SELECT 
                p.id, 
                p.code, 
                p.name, 
                p.reorder_level, 
                p.unit,
                COALESCE(SUM(cs.quantity), 0) as available_quantity,
                (p.reorder_level - COALESCE(SUM(cs.quantity), 0)) as shortage
            FROM products p
            LEFT JOIN current_stock cs ON p.id = cs.product_id
            WHERE p.is_active = TRUE AND p.reorder_level IS NOT NULL
            GROUP BY p.id, p.code, p.name, p.reorder_level, p.unit
            HAVING available_quantity < p.reorder_level
            ORDER BY shortage DESC
        `);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Low stock error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getBatchWiseStock = async (req, res) => {
    try {
        const [data] = await db.query(`
            SELECT 
                cs.id,
                cs.batch_number,
                p.name as product_name,
                p.code as product_code,
                p.grade,
                cs.quantity,
                cs.reserved_quantity,
                cs.hold_quantity,
                cs.unit_cost,
                (cs.quantity * cs.unit_cost) as total_value,
                cs.last_updated
            FROM current_stock cs
            LEFT JOIN products p ON cs.product_id = p.id
            WHERE cs.batch_number IS NOT NULL AND cs.quantity > 0
            ORDER BY cs.last_updated DESC
        `);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Batch stock error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

// ============================================
// CRM REPORTS
// ============================================

const getLeadFunnel = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        let sql = `
            SELECT 
                status,
                COUNT(*) as count,
                COALESCE(SUM(expected_value), 0) as total_value,
                COALESCE(AVG(probability), 0) as avg_probability
            FROM leads
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(created_at) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(created_at) <= ?";
            params.push(to_date);
        }

        sql += " GROUP BY status";

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Lead funnel error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getLeadSourcePerformance = async (req, res) => {
    try {
        const [data] = await db.query(`
            SELECT 
                source,
                COUNT(*) as total_leads,
                SUM(CASE WHEN status = 'Won' THEN 1 ELSE 0 END) as converted,
                SUM(CASE WHEN status = 'Lost' THEN 1 ELSE 0 END) as lost,
                COALESCE(SUM(expected_value), 0) as total_value
            FROM leads
            WHERE source IS NOT NULL
            GROUP BY source
            ORDER BY total_leads DESC
        `);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Lead source error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getQuotationConversion = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        let sql = `
            SELECT 
                status,
                COUNT(*) as count,
                COALESCE(SUM(total), 0) as total_value
            FROM quotations
            WHERE 1=1
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(date) <= ?";
            params.push(to_date);
        }

        sql += " GROUP BY status";

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Quotation conversion error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

// ============================================
// FINANCIAL REPORTS
// ============================================

const getProfitLoss = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        // Build separate queries to avoid param mismatch
        let salesSql = "SELECT COALESCE(SUM(total), 0) as total FROM sales_orders WHERE 1=1";
        let purchaseSql = "SELECT COALESCE(SUM(total), 0) as total FROM purchase_orders WHERE 1=1";
        const salesParams = [];
        const purchaseParams = [];

        if (from_date) {
            salesSql += " AND DATE(order_date) >= ?";
            purchaseSql += " AND DATE(po_date) >= ?";
            salesParams.push(from_date);
            purchaseParams.push(from_date);
        }
        if (to_date) {
            salesSql += " AND DATE(order_date) <= ?";
            purchaseSql += " AND DATE(po_date) <= ?";
            salesParams.push(to_date);
            purchaseParams.push(to_date);
        }

        const [sales] = await db.query(salesSql, salesParams);
        const [purchases] = await db.query(purchaseSql, purchaseParams);

        const totalSales = Number(sales[0].total);
        const totalPurchases = Number(purchases[0].total);
        const grossProfit = totalSales - totalPurchases;

        res.json({
            success: true,
            data: {
                totalSales,
                totalPurchases,
                grossProfit,
                grossMargin: totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(2) : 0,
            },
        });
    } catch (error) {
        console.error("Profit loss error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

const getPaymentCollection = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        let sql = `
            SELECT 
                DATE(payment_date) as date,
                COUNT(*) as total_payments,
                COALESCE(SUM(amount), 0) as total_amount,
                method
            FROM customer_payments
            WHERE status = 'Completed'
        `;
        const params = [];

        if (from_date) {
            sql += " AND DATE(payment_date) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            sql += " AND DATE(payment_date) <= ?";
            params.push(to_date);
        }

        sql += " GROUP BY DATE(payment_date), method ORDER BY date DESC";

        const [data] = await db.query(sql, params);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Payment collection error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
        });
    }
};

// ============================================
// SUMMARY
// ============================================

const getReportSummary = async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        let dateFilter = "";
        const params = [];

        if (from_date) {
            dateFilter += " AND DATE(created_at) >= ?";
            params.push(from_date);
        }
        if (to_date) {
            dateFilter += " AND DATE(created_at) <= ?";
            params.push(to_date);
        }

        const [salesTotal] = await db.query(
            `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count 
             FROM sales_orders WHERE 1=1 ${dateFilter}`,
            params
        );

        const [purchaseTotal] = await db.query(
            `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count 
             FROM purchase_orders WHERE 1=1 ${dateFilter}`,
            params
        );

        const [receivable] = await db.query(
            `SELECT COALESCE(SUM(balance), 0) as total 
             FROM sales_invoices WHERE balance > 0`
        );

        const [payable] = await db.query(
            `SELECT COALESCE(SUM(total), 0) as total 
             FROM purchase_orders WHERE status IN ('Pending', 'Approved', 'Received')`
        );

        const [stockValue] = await db.query(
            `SELECT COALESCE(SUM(quantity * unit_cost), 0) as total 
             FROM current_stock`
        );

        res.json({
            success: true,
            data: {
                sales: {
                    total: parseFloat(salesTotal[0].total),
                    count: salesTotal[0].count,
                },
                purchases: {
                    total: parseFloat(purchaseTotal[0].total),
                    count: purchaseTotal[0].count,
                },
                receivable: parseFloat(receivable[0].total),
                payable: parseFloat(payable[0].total),
                stockValue: parseFloat(stockValue[0].total),
            },
        });
    } catch (error) {
        console.error("Report summary error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch summary",
            error: error.message,
        });
    }
};

module.exports = {
    // Sales
    getSalesSummary,
    getSalesByCustomer,
    getSalesByProduct,
    getSalesBySalesperson,
    getCustomerOutstanding,
    // Purchase
    getPurchaseSummary,
    getPurchaseBySupplier,
    getPurchasePriceHistory,
    // Inventory
    getStockReport,
    getStockMovement,
    getLowStockReport,
    getBatchWiseStock,
    // CRM
    getLeadFunnel,
    getLeadSourcePerformance,
    getQuotationConversion,
    // Financial
    getProfitLoss,
    getPaymentCollection,
    // Summary
    getReportSummary,
};