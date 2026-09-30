INSERT INTO "ledger_category" ("id", "workspace_id", "parent_category_id", "name", "kind", "is_system", "system_key", "created_by_user_id")
VALUES
  ('00000000-0000-4000-8000-000000000201', NULL, NULL, 'Food & dining', 'EXPENSE', true, 'expense:food-dining', NULL),
  ('00000000-0000-4000-8000-000000000202', NULL, '00000000-0000-4000-8000-000000000201', 'Restaurants', 'EXPENSE', true, 'expense:restaurants', NULL),
  ('00000000-0000-4000-8000-000000000203', NULL, '00000000-0000-4000-8000-000000000201', 'Groceries', 'EXPENSE', true, 'expense:food-groceries', NULL),
  ('00000000-0000-4000-8000-000000000204', NULL, '00000000-0000-4000-8000-000000000201', 'Cafés', 'EXPENSE', true, 'expense:cafes', NULL),
  ('00000000-0000-4000-8000-000000000205', NULL, NULL, 'Transport & travel', 'EXPENSE', true, 'expense:transport-travel', NULL),
  ('00000000-0000-4000-8000-000000000206', NULL, '00000000-0000-4000-8000-000000000205', 'Fuel', 'EXPENSE', true, 'expense:fuel', NULL),
  ('00000000-0000-4000-8000-000000000207', NULL, '00000000-0000-4000-8000-000000000205', 'Public transport', 'EXPENSE', true, 'expense:public-transport', NULL),
  ('00000000-0000-4000-8000-000000000208', NULL, '00000000-0000-4000-8000-000000000205', 'Taxis & rideshares', 'EXPENSE', true, 'expense:rideshares', NULL)
ON CONFLICT ("id") DO NOTHING;
