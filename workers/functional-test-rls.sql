-- Create throwaway table
CREATE TABLE public._rls_trigger_test (id int);

-- Check RLS is now ON
SELECT relrowsecurity FROM pg_class WHERE relname='_rls_trigger_test';

-- Clean up
DROP TABLE public._rls_trigger_test;
