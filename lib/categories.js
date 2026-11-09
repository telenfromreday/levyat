const SALES = "Sales & customer payments";
const OWN = "Owner withdrawals & transfers";
const UNC = "Uncategorised";
const CATS = [SALES, "Rent & utilities", "Advertising & marketing", "Transport & fuel", "Software & subscriptions", "Stock & supplies", "Professional services", "Bank fees", "Insurance", "Office supplies", "Salaries & wages", "Contractor payments", "Equipment", "Repairs & maintenance", "Interest paid", "Loan repayments", "Refunds", "Interest received", "Owner contributions", "Transfers between accounts", "Tax (SARS)", OWN, UNC];
/* Categories that are money movements, not business expenses */
const NONEXP = [OWN, "Tax (SARS)", "Transfers between accounts", "Loan repayments", "Owner contributions", "Refunds"];
module.exports = { SALES, OWN, UNC, CATS, NONEXP };
