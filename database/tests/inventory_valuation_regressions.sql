-- Inventory valuation and GR/IR integration regression tests.
DO $$
DECLARE
  org_id uuid := gen_random_uuid();
  site_id uuid := gen_random_uuid();
  warehouse_id uuid := gen_random_uuid();
  supplier_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_lot_id uuid := gen_random_uuid();
  po_id uuid := gen_random_uuid();
  po_item_id uuid := gen_random_uuid();
  gr_id uuid := gen_random_uuid();
  gr2_id uuid := gen_random_uuid();
  bill_id uuid := gen_random_uuid();
  actor_id uuid := gen_random_uuid();
  inv_account uuid := gen_random_uuid();
  grni_account uuid := gen_random_uuid();
  cogs_account uuid := gen_random_uuid();
  ap_account uuid := gen_random_uuid();
  expense_account uuid := gen_random_uuid();
  ar_account uuid := gen_random_uuid();
  revenue_account uuid := gen_random_uuid();
  cash_account uuid := gen_random_uuid();
  bank_account uuid := gen_random_uuid();
  input_tax_account uuid := gen_random_uuid();
  output_tax_account uuid := gen_random_uuid();
  observed numeric(18,2);
  observed_qty numeric(18,4);
  observed_cost numeric(18,2);
BEGIN
  INSERT INTO organizations(id,legal_name) VALUES(org_id,'Inventory Valuation Regression');
  INSERT INTO user_profiles(id,organization_id,auth_subject,full_name,email,status)
  VALUES(actor_id,org_id,'inventory-qa-'||org_id::text,'Inventory QA Actor','inventory-qa-'||org_id::text||'@example.test','active');
  INSERT INTO sites(id,organization_id,code,name,site_type) VALUES(site_id,org_id,'QA','QA Site','warehouse');
  INSERT INTO warehouses(id,organization_id,site_id,code,name,warehouse_type)
  VALUES(warehouse_id,org_id,site_id,'FG','Finished Goods','finished_goods');
  INSERT INTO suppliers(id,organization_id,supplier_code,name) VALUES(supplier_id,org_id,'SUP-QA','Supplier QA');
  INSERT INTO products(id,organization_id,sku,name,product_type,is_sellable,is_purchasable)
  VALUES(v_product_id,org_id,'QA-WATER','QA Water','finished_good',true,true);
  INSERT INTO inventory_lots(id,organization_id,product_id,lot_code,quality_status)
  VALUES(v_lot_id,org_id,v_product_id,'QA-LOT-001','released');

  INSERT INTO chart_of_accounts(id,organization_id,account_code,account_name,account_type) VALUES
    (inv_account,org_id,'1301','Persediaan QA','asset'),
    (grni_account,org_id,'2103','GR/IR QA','liability'),
    (cogs_account,org_id,'5102','HPP QA','expense'),
    (ap_account,org_id,'2101','Utang QA','liability'),
    (expense_account,org_id,'5101','Pembelian QA','expense'),
    (ar_account,org_id,'1201','Piutang QA','asset'),
    (revenue_account,org_id,'4101','Pendapatan QA','revenue'),
    (cash_account,org_id,'1101','Kas QA','asset'),
    (bank_account,org_id,'1102','Bank QA','asset'),
    (input_tax_account,org_id,'1202','Pajak Masukan QA','asset'),
    (output_tax_account,org_id,'2102','Pajak Keluaran QA','liability');
  INSERT INTO accounting_config(
    organization_id,accounts_receivable_id,accounts_payable_id,sales_revenue_id,purchase_expense_id,
    output_tax_id,input_tax_id,cash_account_id,bank_account_id,inventory_asset_id,
    goods_received_not_invoiced_id,cost_of_goods_sold_id
  ) VALUES(org_id,ar_account,ap_account,revenue_account,expense_account,output_tax_account,
    input_tax_account,cash_account,bank_account,inv_account,grni_account,cogs_account);

  INSERT INTO purchase_orders(id,organization_id,site_id,po_number,supplier_id,status,subtotal,tax_amount,total_amount)
  VALUES(po_id,org_id,site_id,'PO-QA-001',supplier_id,'approved',1000,110,1110);
  INSERT INTO purchase_order_items(id,purchase_order_id,product_id,quantity_ordered,quantity_received,unit_price,tax_rate,line_total)
  VALUES(po_item_id,po_id,v_product_id,10,10,100,11,1000);
  INSERT INTO goods_receipts(id,organization_id,receipt_number,purchase_order_id,warehouse_id,status)
  VALUES(gr_id,org_id,'GR-QA-001',po_id,warehouse_id,'posted');
  INSERT INTO goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,lot_id,quantity_received,unit_cost,line_total)
  VALUES(gr_id,po_item_id,v_product_id,v_lot_id,10,100,1000);

  INSERT INTO stock_movements(organization_id,movement_no,movement_type,warehouse_id,product_id,lot_id,
    quantity,unit_cost,reference_type,reference_id)
  VALUES(org_id,'MOV-QA-GR-001','receipt',warehouse_id,v_product_id,v_lot_id,10,100,'goods_receipt',gr_id);
  SELECT quantity_on_hand,carrying_value INTO observed_qty,observed_cost
  FROM inventory_lot_costs WHERE organization_id=org_id AND product_id=v_product_id AND lot_id=v_lot_id;
  IF observed_qty<>10 OR observed_cost<>1000 THEN
    RAISE EXCEPTION 'Receipt valuation incorrect: qty %, value %',observed_qty,observed_cost;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE organization_id=org_id
    AND source_module='inventory_receipt' AND status='posted' AND total_debit=1000 AND total_credit=1000) THEN
    RAISE EXCEPTION 'Goods receipt did not post balanced inventory/GRNI journal';
  END IF;

  INSERT INTO supplier_bills(id,organization_id,supplier_id,purchase_order_id,supplier_invoice_number,
    invoice_date,subtotal,tax_amount,total_amount)
  VALUES(bill_id,org_id,supplier_id,po_id,'INV-QA-001',CURRENT_DATE,1000,110,1110);
  UPDATE supplier_bills SET status='posted',posted_by=actor_id WHERE id=bill_id;
  IF NOT EXISTS(SELECT 1 FROM inventory_grni_applications WHERE supplier_bill_id=bill_id
    AND goods_receipt_id=gr_id AND amount=1000) THEN
    RAISE EXCEPTION 'PO supplier bill did not allocate received GR/IR value';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE organization_id=org_id
    AND source_module='supplier_bill' AND source_id=bill_id AND status='posted'
    AND total_debit=1110 AND total_credit=1110) THEN
    RAISE EXCEPTION 'Matched supplier bill did not post balanced GR/IR/AP journal';
  END IF;
  IF EXISTS(SELECT 1 FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.source_module='supplier_bill' AND je.source_id=bill_id AND jl.account_id=expense_account) THEN
    RAISE EXCEPTION 'Matched PO bill was incorrectly debited to purchase expense';
  END IF;

  INSERT INTO goods_receipts(id,organization_id,receipt_number,purchase_order_id,warehouse_id,status)
  VALUES(gr2_id,org_id,'GR-QA-002',po_id,warehouse_id,'posted');
  INSERT INTO goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,lot_id,quantity_received,unit_cost,line_total)
  VALUES(gr2_id,po_item_id,v_product_id,v_lot_id,10,120,1200);
  INSERT INTO stock_movements(organization_id,movement_no,movement_type,warehouse_id,product_id,lot_id,
    quantity,unit_cost,reference_type,reference_id)
  VALUES(org_id,'MOV-QA-GR-002','receipt',warehouse_id,v_product_id,v_lot_id,10,120,'goods_receipt',gr2_id);
  SELECT quantity_on_hand,carrying_value INTO observed_qty,observed_cost
  FROM inventory_lot_costs WHERE organization_id=org_id AND product_id=v_product_id AND lot_id=v_lot_id;
  IF observed_qty<>20 OR observed_cost<>2200 THEN
    RAISE EXCEPTION 'Second receipt did not recalculate weighted lot value: qty %, value %',observed_qty,observed_cost;
  END IF;

  INSERT INTO stock_movements(organization_id,movement_no,movement_type,warehouse_id,product_id,lot_id,
    quantity,unit_cost,reference_type,reference_id)
  VALUES(org_id,'MOV-QA-DSP-001','sales_pick',warehouse_id,v_product_id,v_lot_id,4,999,'delivery',gen_random_uuid());
  SELECT quantity_on_hand,carrying_value INTO observed_qty,observed_cost
  FROM inventory_lot_costs WHERE organization_id=org_id AND product_id=v_product_id AND lot_id=v_lot_id;
  IF observed_qty<>16 OR observed_cost<>1760 THEN
    RAISE EXCEPTION 'Sales pick did not consume weighted lot cost: qty %, value %',observed_qty,observed_cost;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE organization_id=org_id
    AND source_module='inventory_cogs' AND status='posted' AND total_debit=440 AND total_credit=440) THEN
    RAISE EXCEPTION 'Sales pick did not post correct COGS journal';
  END IF;

  BEGIN
    INSERT INTO stock_movements(organization_id,movement_no,movement_type,warehouse_id,product_id,lot_id,
      quantity,unit_cost,reference_type,reference_id)
    VALUES(org_id,'MOV-QA-DSP-OVER','sales_pick',warehouse_id,v_product_id,v_lot_id,17,0,'delivery',gen_random_uuid());
    RAISE EXCEPTION 'Oversized lot issue was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Oversized lot issue was unexpectedly accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Saldo valuasi lot tidak mencukupi%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE inventory_lot_costs SET carrying_value=0
    WHERE organization_id=org_id AND product_id=v_product_id AND lot_id=v_lot_id;
    RAISE EXCEPTION 'Direct lot cost mutation was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Direct lot cost mutation was unexpectedly accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Saldo valuasi lot hanya boleh berubah%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE inventory_valuation_entries SET total_value=0
    WHERE movement_id=(SELECT movement_id FROM inventory_valuation_entries
      WHERE organization_id=org_id AND movement_type='receipt' LIMIT 1);
    RAISE EXCEPTION 'Inventory valuation ledger mutation was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Inventory valuation ledger mutation was unexpectedly accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Subledger persediaan tidak dapat diubah%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE inventory_grni_applications SET amount=1 WHERE supplier_bill_id=bill_id;
    RAISE EXCEPTION 'GR/IR application mutation was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='GR/IR application mutation was unexpectedly accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Subledger persediaan tidak dapat diubah%' THEN RAISE; END IF;
  END;
END $;
