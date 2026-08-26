-- Shopper card checkout joins the existing M-Pesa and PayPal payment methods.
-- The payment gateway is still responsible for charging and confirming the
-- card; this only lets the order records carry the selected method safely.
alter type payment_method add value if not exists 'card';
