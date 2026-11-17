-- Standard chart of accounts template and safe mapping regression test.
DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_role uuid := gen_random_uuid();
  v_custom_revenue uuid := gen_random_uuid();
  v_count integer;
  v_mapping_count integer;
BEGIN
  INSERT INTO organizations(id,legal_name) VALUES(v_org,'COA Template Regression');
  INSERT INTO user_profiles(id,organization_id,auth_subject,full_name,email,status)
  VALUES(v_actor,v_org,'coa-template-'||v_org::text,'COA QA Owner','coa-template-'||v_org::text||'@example.test','active');
  INSERT INTO roles(id,organization_id,code,name,is_system) VALUES(v_role,v_org,'OWNER','Owner',true);
  INSERT INTO user_role_assignments(user_id,role_id) VALUES(v_actor,v_role);

  INSERT INTO chart_of_accounts(id,organization_id,account_code,account_name,account_type,is_control_account) VALUES
    (gen_random_uuid(),v_org,'1101','Kas','asset',true),
    (gen_random_uuid(),v_org,'1102','Bank','asset',true),
    (gen_random_uuid(),v_org,'1201','Piutang Usaha','asset',true),
    (gen_random_uuid(),v_org,'1202','Pajak Masukan','asset',false),
    (gen_random_uuid(),v_org,'1301','Persediaan Barang Dagang','asset',true),
    (gen_random_uuid(),v_org,'2101','Utang Usaha','liability',true),
    (gen_random_uuid(),v_org,'2102','Pajak Keluaran','liability',false),
    (gen_random_uuid(),v_org,'2103','GR/IR Barang Diterima Belum Ditagih','liability',true),
    (gen_random_uuid(),v_org,'3101','Ekuitas Saldo Awal Persediaan','equity',false),
    (gen_random_uuid(),v_org,'4101','Pendapatan Penjualan','revenue',false),
    (gen_random_uuid(),v_org,'5101','Pembelian / Biaya Pemasok','expense',false),
    (gen_random_uuid(),v_org,'5102','Harga Pokok Penjualan','expense',false)
  ON CONFLICT (organization_id,account_code) DO NOTHING;

  INSERT INTO accounting_config (
    organization_id,accounts_receivable_id,accounts_payable_id,sales_revenue_id,
    purchase_expense_id,output_tax_id,input_tax_id,cash_account_id,bank_account_id,
    inventory_asset_id,goods_received_not_invoiced_id,cost_of_goods_sold_id,
    inventory_opening_equity_id,updated_by
  )
  SELECT v_org,
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1201'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='2101'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='4101'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='5101'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='2102'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1202'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1101'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1102'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1301'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='2103'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='5102'),
    (SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='3101'),
    v_actor
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO chart_of_accounts(id,organization_id,account_code,account_name,account_type)
  VALUES(v_custom_revenue,v_org,'4199','Pendapatan Khusus','revenue');
  UPDATE accounting_config SET sales_revenue_id=v_custom_revenue WHERE organization_id=v_org;

  -- Simulate a repeated template run: missing accounts are added but existing
  -- custom account mappings remain untouched.
  INSERT INTO chart_of_accounts(organization_id,account_code,account_name,account_type,is_control_account) VALUES
    (v_org,'1101','Kas Default','asset',true),
    (v_org,'1102','Bank Default','asset',true),
    (v_org,'1201','Piutang Default','asset',true),
    (v_org,'1202','Pajak Masukan Default','asset',false),
    (v_org,'1301','Persediaan Default','asset',true),
    (v_org,'2101','Utang Default','liability',true),
    (v_org,'2102','Pajak Keluaran Default','liability',false),
    (v_org,'2103','GRIR Default','liability',true),
    (v_org,'3101','Ekuitas Default','equity',false),
    (v_org,'4101','Pendapatan Default','revenue',false),
    (v_org,'5101','Pembelian Default','expense',false),
    (v_org,'5102','HPP Default','expense',false)
  ON CONFLICT (organization_id,account_code) DO NOTHING;

  UPDATE accounting_config c SET
    accounts_receivable_id=COALESCE(c.accounts_receivable_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1201')),
    accounts_payable_id=COALESCE(c.accounts_payable_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='2101')),
    sales_revenue_id=COALESCE(c.sales_revenue_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='4101')),
    purchase_expense_id=COALESCE(c.purchase_expense_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='5101')),
    output_tax_id=COALESCE(c.output_tax_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='2102')),
    input_tax_id=COALESCE(c.input_tax_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1202')),
    cash_account_id=COALESCE(c.cash_account_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1101')),
    bank_account_id=COALESCE(c.bank_account_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1102')),
    inventory_asset_id=COALESCE(c.inventory_asset_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='1301')),
    goods_received_not_invoiced_id=COALESCE(c.goods_received_not_invoiced_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='2103')),
    cost_of_goods_sold_id=COALESCE(c.cost_of_goods_sold_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='5102')),
    inventory_opening_equity_id=COALESCE(c.inventory_opening_equity_id,(SELECT id FROM chart_of_accounts WHERE organization_id=v_org AND account_code='3101'))
  WHERE c.organization_id=v_org;

  SELECT count(*) INTO v_count FROM chart_of_accounts WHERE organization_id=v_org;
  SELECT count(*) INTO v_mapping_count FROM accounting_config c
  WHERE c.organization_id=v_org AND c.accounts_receivable_id IS NOT NULL
    AND c.accounts_payable_id IS NOT NULL AND c.sales_revenue_id IS NOT NULL
    AND c.purchase_expense_id IS NOT NULL AND c.output_tax_id IS NOT NULL
    AND c.input_tax_id IS NOT NULL AND c.cash_account_id IS NOT NULL
    AND c.bank_account_id IS NOT NULL AND c.inventory_asset_id IS NOT NULL
    AND c.goods_received_not_invoiced_id IS NOT NULL AND c.cost_of_goods_sold_id IS NOT NULL
    AND c.inventory_opening_equity_id IS NOT NULL
    AND c.sales_revenue_id=v_custom_revenue;
  IF v_count<>13 OR v_mapping_count<>1 THEN
    RAISE EXCEPTION 'Standard COA template or mapping preservation failed';
  END IF;
END $$;
