// Original in-memory report calculation retained only as an independent test oracle.
import { age, categories, personStatus } from "../../src/domain.js";
import { toSatang } from "../../src/money.js";

export function summarize(people, from, to) {
  const within = (d) => d >= from && d <= to;
  const monthly = [];
  let year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7));
  while (`${year}-${String(month).padStart(2, "0")}` <= to.slice(0, 7)) {
    monthly.push({
      month: `${year}-${String(month).padStart(2, "0")}`,
      requested: 0,
      helped: 0,
      requestedPeople: 0,
      helpedPeople: 0,
      amount: 0,
    });
    month++;
    if (month === 13) {
      month = 1;
      year++;
    }
  }
  const months = new Map(monthly.map((m) => [m.month, m]));
  const applicants = new Map(monthly.map((m) => [m.month, new Set()]));
  const recipients = new Map(monthly.map((m) => [m.month, new Set()]));
  const helpedPeople = new Set();
  const result = {
    people: 0,
    requests: 0,
    done: 0,
    partial: 0,
    closed: 0,
    amount: 0,
    helpedPeople: 0,
    helpedEvents: 0,
    unknownAge: 0,
    category: categories.map(() => 0),
    ages: [0, 0, 0, 0],
    villages: {},
    monthly,
  };
  for (const p of people) {
    const rs = (p.requests || []).filter((r) => within(r.date));
    if (rs.length) {
      result.people++;
      result.requests += rs.length;
      const status = personStatus({ requests: rs });
      if (status === "done") result.done++;
      if (status === "partial") result.partial++;
      if (status === "closed") result.closed++;
      const a = age(p.birth, to);
      if (a !== null) result.ages[a < 18 ? 0 : a < 26 ? 1 : a < 60 ? 2 : 3]++;
      else result.unknownAge++;
      result.villages[p.village] = (result.villages[p.village] || 0) + 1;
      for (let c = 0; c < 7; c++)
        if (rs.some((r) => Number(r.category) === c)) result.category[c]++;
      for (const r of rs) {
        const key = r.date.slice(0, 7);
        months.get(key).requested++;
        applicants.get(key).add(p);
      }
    }
    for (const r of p.requests || [])
      for (const payment of r.payments || [])
        if (within(payment.date)) {
          const key = payment.date.slice(0, 7),
            amount = toSatang(payment.amount);
          if (amount === null) throw new Error("ข้อมูลจำนวนเงินไม่ถูกต้อง");
          result.amount += amount;
          result.helpedEvents++;
          helpedPeople.add(p);
          months.get(key).helped++;
          months.get(key).amount += amount;
          recipients.get(key).add(p);
        }
  }
  result.amount /= 100;
  result.helpedPeople = helpedPeople.size;
  for (const m of monthly) {
    m.amount /= 100;
    m.requestedPeople = applicants.get(m.month).size;
    m.helpedPeople = recipients.get(m.month).size;
  }
  return result;
}
