-- How a shop's customers receive their orders: pickup only, delivery only, or
-- both. A per-shop setting the seller controls, shown to buyers so they know
-- what to expect before they order.
--
-- Default 'both' — the least surprising for existing shops, which so far have
-- arranged fulfilment ad hoc over WhatsApp (the checkout copy already says
-- "delivery is arranged with the seller"). The column is public shop info, so
-- it's safe under the existing `merchants public read` policy.

alter table merchants
  add column if not exists fulfillment text not null default 'both';

alter table merchants drop constraint if exists merchants_fulfillment_chk;
alter table merchants add constraint merchants_fulfillment_chk
  check (fulfillment in ('pickup', 'delivery', 'both'));
