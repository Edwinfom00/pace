-- Backfill only children whose canonical system root is already present. This
-- keeps installations with a smaller root catalog untouched and makes the
-- migration safe to apply more than once through the system-key constraint.
INSERT INTO "ledger_category" (
  "id", "workspace_id", "parent_category_id", "name", "kind", "is_system", "system_key", "created_by_user_id"
)
SELECT child.id, NULL, root.id, child.name, root.kind, true, child.system_key, NULL
FROM (
  VALUES
    ('00000000-0000-4000-8000-000000000301', 'expense:dining', 'Restaurants', 'expense:dining:restaurants'),
    ('00000000-0000-4000-8000-000000000302', 'expense:dining', 'Cafés', 'expense:dining:cafes'),
    ('00000000-0000-4000-8000-000000000303', 'expense:dining', 'Delivery', 'expense:dining:delivery'),
    ('00000000-0000-4000-8000-000000000304', 'expense:transport', 'Fuel', 'expense:transport:fuel'),
    ('00000000-0000-4000-8000-000000000305', 'expense:transport', 'Taxi / ride-hailing', 'expense:transport:ride-hailing'),
    ('00000000-0000-4000-8000-000000000306', 'expense:transport', 'Public transport', 'expense:transport:public-transport'),
    ('00000000-0000-4000-8000-000000000307', 'expense:transport', 'Parking', 'expense:transport:parking'),
    ('00000000-0000-4000-8000-000000000308', 'expense:transport', 'Vehicle maintenance', 'expense:transport:vehicle-maintenance'),
    ('00000000-0000-4000-8000-000000000309', 'expense:housing', 'Rent', 'expense:housing:rent'),
    ('00000000-0000-4000-8000-000000000310', 'expense:housing', 'Maintenance', 'expense:housing:maintenance'),
    ('00000000-0000-4000-8000-000000000311', 'expense:utilities', 'Electricity', 'expense:utilities:electricity'),
    ('00000000-0000-4000-8000-000000000312', 'expense:utilities', 'Water', 'expense:utilities:water'),
    ('00000000-0000-4000-8000-000000000313', 'expense:utilities', 'Internet', 'expense:utilities:internet'),
    ('00000000-0000-4000-8000-000000000314', 'expense:utilities', 'Mobile', 'expense:utilities:mobile'),
    ('00000000-0000-4000-8000-000000000315', 'expense:health', 'Pharmacy', 'expense:health:pharmacy'),
    ('00000000-0000-4000-8000-000000000316', 'expense:health', 'Doctor', 'expense:health:doctor'),
    ('00000000-0000-4000-8000-000000000317', 'expense:health', 'Hospital', 'expense:health:hospital'),
    ('00000000-0000-4000-8000-000000000318', 'expense:health', 'Insurance', 'expense:health:insurance'),
    ('00000000-0000-4000-8000-000000000319', 'expense:shopping', 'Clothing', 'expense:shopping:clothing'),
    ('00000000-0000-4000-8000-000000000320', 'expense:shopping', 'Electronics', 'expense:shopping:electronics'),
    ('00000000-0000-4000-8000-000000000321', 'expense:shopping', 'Household', 'expense:shopping:household'),
    ('00000000-0000-4000-8000-000000000322', 'expense:shopping', 'Personal purchases', 'expense:shopping:personal-purchases'),
    ('00000000-0000-4000-8000-000000000323', 'expense:entertainment', 'Streaming', 'expense:entertainment:streaming'),
    ('00000000-0000-4000-8000-000000000324', 'expense:entertainment', 'Games', 'expense:entertainment:games'),
    ('00000000-0000-4000-8000-000000000325', 'expense:entertainment', 'Events', 'expense:entertainment:events'),
    ('00000000-0000-4000-8000-000000000326', 'expense:entertainment', 'Leisure', 'expense:entertainment:leisure')
) AS child(id, root_system_key, name, system_key)
JOIN "ledger_category" AS root
  ON root."system_key" = child.root_system_key
  AND root."workspace_id" IS NULL
  AND root."parent_category_id" IS NULL
  AND root."is_system" = true
  AND root."kind" = 'EXPENSE'
ON CONFLICT ("system_key") DO NOTHING;
