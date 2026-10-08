const generateCode = (prefix, lastNumber) => {
    const num = parseInt(lastNumber) + 1;
    return `${prefix}-${String(num).padStart(5, "0")}`;
};

const generateId = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

const formatDate = (date) => {
    if (!date) return null;
    return new Date(date).toISOString().split("T")[0];
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

const getStatusColor = (status) => {
    const colors = {
        "Active": "success",
        "Inactive": "danger",
        "Pending": "warning",
        "Completed": "success",
        "Cancelled": "danger",
        "Draft": "gray",
        "Approved": "success",
        "Rejected": "danger",
        "Sent": "info",
        "Received": "success",
        "Partial": "warning",
        "Paid": "success",
        "Unpaid": "danger",
        "Overdue": "danger",
        "New": "info",
        "Contacted": "warning",
        "Qualified": "success",
        "Negotiation": "warning",
        "Won": "success",
        "Lost": "danger",
        "Hold": "warning",
        "Accepted": "success",
        "Expired": "danger",
        "QC Pending": "warning",
        "Partially Accepted": "warning"
    };
    return colors[status] || "default";
};

module.exports = {
    generateCode,
    generateId,
    formatDate,
    formatCurrency,
    getStatusColor
};