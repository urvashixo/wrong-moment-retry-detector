-- Wrong Moment Retry Detector — Supabase Schema
-- Source: Section 12 of spec

-- Customers (can be minimal; mostly a reference table)
create table if not exists customers (
    customer_id text primary key,
    created_at timestamptz default now(),
    hidden_profile_tag text  -- ONLY for synthetic data generation/testing, remove/ignore in "real" mode
);

-- Raw payment events (both successes and failures — this is your core history table)
create table if not exists payment_events (
    id uuid primary key default gen_random_uuid(),
    customer_id text references customers(customer_id),
    mandate_id text,
    transaction_id text,
    amount numeric not null,
    status text check (status in ('success', 'failed')) not null,
    failure_reason text,
    payment_method text,
    attempted_at timestamptz not null,
    created_at timestamptz default now()
);
create index if not exists idx_payment_events_customer on payment_events(customer_id);
create index if not exists idx_payment_events_status on payment_events(status);

-- Retry decisions (the core audit trail — Section 6.1)
create table if not exists retry_decisions (
    decision_id uuid primary key default gen_random_uuid(),
    customer_id text references customers(customer_id),
    mandate_id text,
    original_failure_event_id uuid references payment_events(id),
    retry_attempt_number int not null,
    max_retries_allowed int not null,
    model_basis text not null,
    data_points_used int not null,
    confidence numeric not null,
    fallback_used boolean default false,
    recommended_retry_at timestamptz not null,
    llm_explanation text,
    llm_call_succeeded boolean,
    actual_retry_outcome text check (actual_retry_outcome in ('success','failed','pending')) default 'pending',
    actual_retry_executed_at timestamptz,
    created_at timestamptz default now()
);
create index if not exists idx_retry_decisions_customer on retry_decisions(customer_id);

-- Batch-level aggregate metrics (for your demo dashboard — Section 6.2)
create table if not exists demo_batches (
    batch_id uuid primary key default gen_random_uuid(),
    label text,
    total_failed_payments int,
    retried_with_smart_timing int,
    recovered_count int,
    recovered_amount_total numeric,
    baseline_fixed_schedule_recovered_count int,
    baseline_fixed_schedule_recovered_amount numeric,
    improvement_pct numeric,
    cold_start_fallback_count int,
    created_at timestamptz default now()
);

-- Webhook event log (raw dump for debugging/audit, optional but useful)
create table if not exists webhook_log (
    id uuid primary key default gen_random_uuid(),
    event_type text,
    raw_payload jsonb,
    processed boolean default false,
    received_at timestamptz default now()
);
