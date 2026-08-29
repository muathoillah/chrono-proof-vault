
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'OPEN' check (status in ('OPEN','SEALED','CLOSED')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.merkle_batches (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  root_hash text not null,
  signature text not null,
  public_key text not null,
  evidence_count int not null,
  sealed_by uuid,
  sealed_by_email text,
  sealed_at timestamptz not null default now()
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null,
  file_hash text not null,
  prev_chain_hash text,
  chain_hash text not null,
  batch_id uuid references public.merkle_batches(id) on delete set null,
  merkle_proof jsonb,
  status text not null default 'UNSEALED' check (status in ('UNSEALED','SEALED','TAMPERED')),
  uploaded_by uuid,
  uploaded_by_email text,
  created_at timestamptz not null default now()
);

create table public.custody_log (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  actor uuid,
  actor_email text not null,
  action text not null,
  notes text,
  hash_snapshot text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.cases to authenticated;
grant select, insert, update, delete on public.merkle_batches to authenticated;
grant select, insert, update, delete on public.evidence to authenticated;
grant select, insert, update, delete on public.custody_log to authenticated;
grant all on public.cases to service_role;
grant all on public.merkle_batches to service_role;
grant all on public.evidence to service_role;
grant all on public.custody_log to service_role;

alter table public.cases enable row level security;
alter table public.merkle_batches enable row level security;
alter table public.evidence enable row level security;
alter table public.custody_log enable row level security;

create policy "Authenticated full access cases" on public.cases for all to authenticated using (true) with check (true);
create policy "Authenticated full access merkle_batches" on public.merkle_batches for all to authenticated using (true) with check (true);
create policy "Authenticated full access evidence" on public.evidence for all to authenticated using (true) with check (true);
create policy "Authenticated full access custody_log" on public.custody_log for all to authenticated using (true) with check (true);

create policy "Authenticated read evidence files" on storage.objects for select to authenticated using (bucket_id = 'evidence-files');
create policy "Authenticated write evidence files" on storage.objects for insert to authenticated with check (bucket_id = 'evidence-files');
create policy "Authenticated update evidence files" on storage.objects for update to authenticated using (bucket_id = 'evidence-files') with check (bucket_id = 'evidence-files');
create policy "Authenticated delete evidence files" on storage.objects for delete to authenticated using (bucket_id = 'evidence-files');

-- Demo case with a real SHA-256 hash chain (chain_hash = sha256(prev_chain_hash || file_hash || created_at || 'demo-investigator'))
insert into public.cases (id, title, description, status) values
  ('11111111-1111-4111-8111-111111111111', 'Perusahaan XYZ Data Breach', 'Investigasi kebocoran data internal: dugaan eksfiltrasi data via email dan arsip terenkripsi.', 'OPEN');

insert into public.evidence (id, case_id, filename, mime_type, size_bytes, storage_path, file_hash, prev_chain_hash, chain_hash, uploaded_by_email, created_at) values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111', 'exhibit-a-chat.txt', 'text/plain', 257, 'demo/exhibit-a-chat.txt', 'a3c4d00bce9f3abfac243b65774c6f5b28fed904b0e7b7fca3b43935c091c03f', null, 'bd76d4e0256bdc4cf31e1877f0d2e20816269b3acd627c35719f448ab7e423cb', 'demo-investigator', '2026-08-20T02:15:00.000Z'),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111111', 'exhibit-b-syslog.txt', 'text/plain', 289, 'demo/exhibit-b-syslog.txt', 'fc9fd7ff32334495536caa1f343f29e12689be724a9197c43756b1df830362b5', 'bd76d4e0256bdc4cf31e1877f0d2e20816269b3acd627c35719f448ab7e423cb', '9e933444b12d57c1552078ac9f6c26e9ec166f2d99d56e322f30840bc96536a7', 'demo-investigator', '2026-08-20T02:16:00.000Z'),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111111', 'exhibit-c-email.txt', 'text/plain', 223, 'demo/exhibit-c-email.txt', '1eb9b05d51f3fa71f22dbd6b0ded1436f506e6c6b3dec00379725f8c9f6463e2', '9e933444b12d57c1552078ac9f6c26e9ec166f2d99d56e322f30840bc96536a7', '1cada4fb686778b86a187a2c48332aafd287439352213df7b11e031ffe315ca4', 'demo-investigator', '2026-08-20T02:17:00.000Z');

insert into public.custody_log (evidence_id, case_id, actor_email, action, notes, hash_snapshot, created_at) values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111', 'demo-investigator', 'COLLECTED', 'Chat export dari perangkat tersangka, diserahkan dalam keadaan tersegel.', 'bd76d4e0256bdc4cf31e1877f0d2e20816269b3acd627c35719f448ab7e423cb', '2026-08-20T02:15:00.000Z'),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111111', 'demo-investigator', 'COLLECTED', 'Fragmen syslog server XYZ, diperoleh via imaging disk.', '9e933444b12d57c1552078ac9f6c26e9ec166f2d99d56e322f30840bc96536a7', '2026-08-20T02:16:00.000Z'),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111111', 'demo-investigator', 'COLLECTED', 'Email hasil recovery dari mailbox tersangka.', '1cada4fb686778b86a187a2c48332aafd287439352213df7b11e031ffe315ca4', '2026-08-20T02:17:00.000Z');
