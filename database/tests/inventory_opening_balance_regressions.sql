-- Owner-controlled opening valuation regression test.
BEGIN;
DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_site uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_lot uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_role uuid := gen_random_uuid();
  v_asset uuid := gen_random_uuid();
  v_equity uuid := gen_random_uuid();
  v_opening uuid;
  v_journal uuid;
  v_qty numeric(18,4);
  v_value numeric(18,2);
  v_pending boolean;
BEGIN
  INSERT INTO organizations(id,legal_name) VALUES(v_org,'Opening Balance Regression');
  INSERT INTO sites(id,organization_id,code,name,site_type)
  VALUES(v_site,v_org,'OPEN-QA','Opening QA','warehouse');
  INSERT INTO warehouses(id,organization_id,site_id,code,name,warehouse_type)
  VALUES(v_warehouse,v_org,v_site,'OPEN-FG','Opening Finished Goods','finished_goods');
  INSERT INTO products(id,organization_id,sku,name,product_type,is_sellable,is_purchasable)
  VALUES(v_product,v_org,'OPEN-WATER','Opening Water','finished_good',true,true);
  INSERT INTO inventory_lots(id,organization_id,product_id,lot_code,quality_status)
  VALUES(v_lot,v_org,v_product,'OPEN-LOT-001','released');
  INSERT INTO inventory_balances(organization_id,warehouse_id,product_id,lot_id,quantity_on_hand,quantity_reserved)
  VALUES(v_org,v_warehouse,v_product,v_lot,25,0);

  INSERT INTO user_profiles(id,organization_id,auth_subject,full_name,email,status)
  VALUES(v_actor,v_org,'opening-qa-'||v_org::text,'Opening QA Owner','opening-qa-'||v_org::text||'@example.test','active');
  INSERT INTO roles(id,organization_id,code,name,is_system)
  VALUES(v_role,v_org,'OWNER','Owner',true);
  INSERT INTO user_role_assignments(user_id,role_id) VALUES(v_actor,v_role);

  INSERT INTO chart_of_accounts(id,organization_id,account_code,account_name,account_type) VALUES
    (v_asset,v_org,'1301','Persediaan','asset'),
    (v_equity,v_org,'3101','Ekuitas Saldo Awal','equity');
  INSERT INTO accounting_config(organization_id,inventory_asset_id,inventory_opening_equity_id,updated_by)
  VALUES(v_org,v_asset,v_equity,v_actor);

  EXECUTE 'ALTER TABLE inventory_lot_costs DISABLE TRIGGER trg_guard_inventory_lot_cost_write';
  INSERT INTO inventory_lot_costs(organization_id,product_id,lot_id,quantity_on_hand,carrying_value,opening_balance_pending)
  VALUES(v_org,v_product,v_lot,25,0,true);
  EXECUTE 'ALTER TABLE inventory_lot_costs ENABLE TRIGGER trg_guard_inventory_lot_cost_write';

  INSERT INTO inventory_opening_balances(organization_id,product_id,lot_id,quantity,total_value,posted_by)
  VALUES(v_org,v_product,v_lot,25,2500,v_actor)
  RETURNING id INTO v_opening;
  SELECT journal_entry_id INTO v_journal FROM inventory_opening_balances WHERE id=v_opening;

  SELECT quantity_on_hand,carrying_value,opening_balance_pending
  INTO v_qty,v_value,v_pending
  FROM inventory_lot_costs
  WHERE organization_id=v_org AND product_id=v_product AND lot_id=v_lot;
  IF v_qty<>25 OR v_value<>2500 OR v_pending THEN
    RAISE EXCEPTION 'Opening valuation did not update lot cost correctly';
  END IF;
  IF v_journal IS NULL OR NOT EXISTS(
    SELECT 1 FROM journal_entries
    WHERE id=v_journal AND organization_id=v_org AND source_module='inventory_opening_balance'
      AND source_id=v_opening AND status='posted' AND total_debit=2500 AND total_credit=2500
  ) THEN
    RAISE EXCEPTION 'Opening balance did not create a balanced immutable journal';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM journal_lines WHERE journal_entry_id=v_journal AND account_id=v_asset AND debit=2500
  ) OR NOT EXISTS(
    SELECT 1 FROM journal_lines WHERE journal_entry_id=v_journal AND account_id=v_equity AND credit=2500
  ) THEN
    RAISE EXCEPTION 'Opening balance journal accounts are incorrect';
  END IF;

  BEGIN
    UPDATE inventory_opening_balances SET total_value=1 WHERE id=v_opening;
    RAISE EXCEPTION 'Opening balance document was unexpectedly mutable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Opening balance document was unexpectedly mutable' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Dokumen saldo awal persediaan tidak dapat diubah%' THEN RAISE; END IF;
  END;
END $$;
COMMIT;
