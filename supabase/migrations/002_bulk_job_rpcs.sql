create or replace function increment_bulk_job_completed(job_id uuid)
returns void as $$
  update bulk_jobs set completed = completed + 1 where id = job_id;
$$ language sql;

create or replace function increment_bulk_job_failed(job_id uuid)
returns void as $$
  update bulk_jobs set failed = failed + 1 where id = job_id;
$$ language sql;
