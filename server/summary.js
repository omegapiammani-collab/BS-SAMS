import { closed } from "../src/domain.js";

// All grouping stays inside D1. Only the bounded aggregate JSON crosses into the Worker.
export function summaryQuery(
  from,
  to,
  selection = { where: "deleted_at IS NULL", args: [] },
) {
  return {
    args: [from, to, ...selection.args],
    sql: `WITH RECURSIVE
      bounds AS (SELECT ? AS start, ? AS end),
      months(month) AS (
        SELECT substr(start,1,7) FROM bounds
        UNION ALL
        SELECT strftime('%Y-%m',month||'-01','+1 month') FROM months,bounds
        WHERE month<substr(end,1,7)
      ),
      scoped AS (
        SELECT id,village,json_extract(data,'$.birth') AS birth,
          json_extract(data,'$.requests') AS requests
        FROM people WHERE ${selection.where}
      ),
      request_rows AS (
        SELECT p.id,p.village,p.birth,
          json_extract(r.value,'$.date') AS date,
          CAST(json_extract(r.value,'$.category') AS INTEGER) AS category,
          json_extract(r.value,'$.status') AS status,
          json_extract(r.value,'$.payments') AS payments
        FROM scoped p,json_each(p.requests) r
      ),
      requested AS (
        SELECT r.* FROM request_rows r,bounds b WHERE r.date BETWEEN b.start AND b.end
      ),
      applicants AS (
        SELECT id,village,birth,
          CASE
            WHEN count(*)=sum(status='done') THEN 'done'
            WHEN sum(status NOT IN (${closed.map((s) => `'${s}'`).join(",")}))=0 THEN 'closed'
            WHEN sum(status='done' OR coalesce(json_array_length(payments),0)>0)>0 THEN 'partial'
            ELSE 'open'
          END AS status
        FROM requested GROUP BY id
      ),
      applicant_ages AS (
        SELECT *, CASE WHEN birth IS NULL OR birth='' THEN NULL ELSE
          CAST(substr(b.end,1,4) AS INTEGER)-CAST(substr(birth,1,4) AS INTEGER)
          -(substr(b.end,6)<substr(birth,6)) END AS age
        FROM applicants,bounds b
      ),
      payments AS (
        SELECT r.id,json_extract(p.value,'$.date') AS date,
          CAST(round(coalesce(json_extract(p.value,'$.amount'),0)*100) AS INTEGER) AS satang
        FROM request_rows r,json_each(r.payments) p,bounds b
        WHERE json_extract(p.value,'$.date') BETWEEN b.start AND b.end
      ),
      request_months AS (
        SELECT substr(date,1,7) AS month,count(*) AS requests,count(DISTINCT id) AS people
        FROM requested GROUP BY month
      ),
      payment_months AS (
        SELECT substr(date,1,7) AS month,count(*) AS events,count(DISTINCT id) AS people,
          sum(satang) AS satang
        FROM payments GROUP BY month
      ),
      category_ids(id) AS (VALUES(0),(1),(2),(3),(4),(5),(6)),
      category_counts AS (
        SELECT category,count(DISTINCT id) AS total FROM requested GROUP BY category
      ),
      village_counts AS (
        SELECT village,count(*) AS total FROM applicants GROUP BY village
      )
      SELECT json_object(
        'people',(SELECT count(*) FROM applicants),
        'requests',(SELECT count(*) FROM requested),
        'done',(SELECT count(*) FROM applicants WHERE status='done'),
        'partial',(SELECT count(*) FROM applicants WHERE status='partial'),
        'closed',(SELECT count(*) FROM applicants WHERE status='closed'),
        'amount',(SELECT coalesce(sum(satang),0)/100.0 FROM payments),
        'helpedPeople',(SELECT count(DISTINCT id) FROM payments),
        'helpedEvents',(SELECT count(*) FROM payments),
        'unknownAge',(SELECT count(*) FROM applicant_ages WHERE age IS NULL),
        'category',json((SELECT json_group_array(total) FROM (
          SELECT coalesce(c.total,0) AS total FROM category_ids i
          LEFT JOIN category_counts c ON c.category=i.id ORDER BY i.id
        ))),
        'ages',json_array(
          (SELECT count(*) FROM applicant_ages WHERE age<18),
          (SELECT count(*) FROM applicant_ages WHERE age BETWEEN 18 AND 25),
          (SELECT count(*) FROM applicant_ages WHERE age BETWEEN 26 AND 59),
          (SELECT count(*) FROM applicant_ages WHERE age>=60)
        ),
        'villages',json((SELECT json_group_object(village,total) FROM village_counts)),
        'monthly',json((SELECT json_group_array(json_object(
          'month',month,'requested',requests,'helped',events,
          'requestedPeople',requestedPeople,'helpedPeople',helpedPeople,'amount',amount
        )) FROM (
          SELECT m.month,coalesce(r.requests,0) AS requests,coalesce(p.events,0) AS events,
            coalesce(r.people,0) AS requestedPeople,coalesce(p.people,0) AS helpedPeople,
            coalesce(p.satang,0)/100.0 AS amount
          FROM months m LEFT JOIN request_months r ON r.month=m.month
          LEFT JOIN payment_months p ON p.month=m.month ORDER BY m.month
        )))
      ) AS summary`,
  };
}

export async function readSummary(db, from, to, selection) {
  const query = summaryQuery(from, to, selection);
  const row = await db
    .prepare(query.sql)
    .bind(...query.args)
    .first();
  return JSON.parse(row.summary);
}
