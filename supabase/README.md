# Supabase Setup

Phase 1B adds the schema, RLS policies, and client adapter. The app still defaults to mock mode.

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations/` in filename order.
3. Create Auth users for the admin and employees.
4. Copy `supabase/seed.example.sql`, replace the placeholder UUIDs with real `auth.users.id` values, and run it.
5. Copy `app/.env.example` to `app/.env.local`.
6. Set `VITE_TIME_CLOCK_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
7. Restart the Vite dev server.

The first admin profile must be inserted with service-role access or from the SQL editor because client-side admin policies require an existing admin.

## Adding Employees in Supabase Mode

The static web app cannot safely create Supabase Auth users by itself because that requires a service-role secret.

For now:

1. Create the employee login in Supabase Auth.
2. Copy the new user's `auth.users.id`.
3. In the app Setup tab, use `+ Add Employee` and paste that Auth user ID.

A later onboarding phase can replace this with a safer invite/admin function.

## Removing Employees

The Setup tab uses the profile's `is_active` flag as the normal access control. Turning off `Active` keeps payroll history intact while preventing the employee from using the clock workflow.

The delete icon is intended only for mistaken or test profiles with no time history. It removes the app profile row, not the Supabase Auth user. Removing the underlying Auth login still needs to be done manually in Supabase Auth until a later service-role onboarding/admin function exists.

## Archiving Job Codes

Job codes use `is_active` for whether employees can select them and `is_archived` for whether they should stay out of the normal Setup list. Archived job codes remain available for historical timesheet/report display.
