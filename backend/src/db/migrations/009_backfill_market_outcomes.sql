UPDATE markets
SET outcomes = ARRAY['Yes', 'No']
WHERE outcomes IS NULL;
