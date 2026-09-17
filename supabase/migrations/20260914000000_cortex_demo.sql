-- Optional example schema for YOUR integrating application's development project.
-- Existing applications should adapt their own storage; never apply this to Cortex.
create table public.cortex_demo_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assistant_id text not null,
  external_user_id text not null,
  external_session_id text not null,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create table public.cortex_demo_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  question text not null,
  answer jsonb not null check (jsonb_typeof(answer) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id) references public.cortex_demo_conversations(id, owner_id) on delete cascade
);
create index cortex_demo_conversations_owner on public.cortex_demo_conversations(owner_id, created_at);
create index cortex_demo_messages_owner_conversation on public.cortex_demo_messages(owner_id, conversation_id, created_at);
alter table public.cortex_demo_conversations enable row level security;
alter table public.cortex_demo_messages enable row level security;
revoke all on public.cortex_demo_conversations, public.cortex_demo_messages from anon, authenticated;
grant select on public.cortex_demo_conversations, public.cortex_demo_messages to authenticated;
grant all on public.cortex_demo_conversations, public.cortex_demo_messages to service_role;
create policy "Read own conversations" on public.cortex_demo_conversations for select to authenticated using (owner_id = (select auth.uid()));
create policy "Read own messages" on public.cortex_demo_messages for select to authenticated using (owner_id = (select auth.uid()));
-- Writes are server-only so clients cannot forge persisted Cortex reference capabilities.
