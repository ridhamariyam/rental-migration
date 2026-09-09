# Salary & Payslips — A Simple Guide for Shop Owners

This explains how the new "Salary" page works, in plain language. No
technical knowledge needed — just follow the steps.

## The basic idea

Every staff member's pay now works like this:

> **Their monthly salary is spread across all the hours they're expected
> to work that month.** If they work fewer hours than expected on a day,
> that day's pay is reduced a little. If they work more hours than
> expected, they get paid extra for those overtime hours (if you've set
> an overtime rate).

This replaces the old "just count present days" method, so pay now
reflects actual hours worked, not just whether someone showed up.

---

## Step 1: Set up a staff member's pay

Go to **Dashboard → Salary**, pick the staff member from the dropdown,
and click **"Configure pay"**. You'll see these fields:

| Field | What it means | Example |
|---|---|---|
| **Monthly amount** | Their full salary for a normal month | ₹20,000 |
| **Standard hours/day** | How many hours count as "one full day" for them | 8 |
| **Weekly off day** | Which day of the week they never work (pick "None" if they work every day) | Sunday |
| **Overtime rate/hour** | Extra amount paid for every hour worked beyond their standard hours. Leave blank if you don't pay overtime | ₹50 |
| **Effective from** | The date this pay setup starts applying | 1st of the month |

Click **Save**. Done — you don't need to do this again every month. It
only needs to change if their salary changes, or their working hours
change.

### A note on "Working days"

You'll notice there's **no field asking you how many working days are in
the month**. That's on purpose — the app works it out automatically by
looking at the actual calendar and subtracting their weekly off day. So:

- A 31-day month with 4 Sundays → 27 working days
- A 30-day month with 4 Sundays → 26 working days
- A 31-day month with 5 Sundays → 26 working days

You never need to remember or type this — it's always correct for that
specific month.

---

## Step 2: What happens day-to-day (you don't need to do anything)

As staff check in and check out each day using the attendance feature,
the app quietly keeps track of how many hours they actually worked. You
don't need to enter anything manually — this happens automatically.

If something looks wrong (someone forgot to check out, or checked in by
mistake), go to **Dashboard → Attendance** and use **"Correct"** to fix
that day. Do this *before* you generate the payslip for that month,
because a payslip only ever uses what attendance shows at the time you
generate it.

---

## Step 3: Understand how a day gets paid

Say someone's standard day is 8 hours:

- **Worked exactly 8 hours** → full pay for that day.
- **Worked only 6 hours** (left early) → paid for 6 hours' worth, not the
  full day. So a shortfall quietly reduces that day's pay — no manual
  calculation needed on your end.
- **Worked 10 hours** (stayed late) → paid for a full 8-hour day, *plus*
  2 extra hours at whatever overtime rate you set. If you didn't set an
  overtime rate, those extra 2 hours simply aren't paid extra (but the
  day isn't penalized either).
- **On approved leave** → paid in full for that day, same as a normal
  full day. (Make sure you've approved their leave request under
  **Dashboard → Leave** before generating the payslip — an unapproved
  leave request counts as an absence.)
- **Didn't show up at all, and no leave request** → counted as absent,
  no pay for that day.
- **Checked in but never checked out** → treated as if they worked 0
  hours that day *until you correct it*. This is a safety net so no one
  accidentally gets overpaid because they forgot to tap "check out."
- **Their weekly off day** (e.g. every Sunday) → not counted at all, not
  a working day, no pay expected, nothing to worry about.

---

## Step 4: When someone joins partway through a month

Say someone joins on the 10th of the month. Here's what you do:

1. Configure their pay as usual, but set **"Effective from"** to their
   actual **joining date** (e.g. the 10th), not the 1st of the month.
2. That's it. When you calculate their salary for that month, the app
   automatically only counts days from the 10th onward — the days before
   they joined are simply left out, **not** counted as if they were
   absent. So their first payslip will naturally be a smaller, partial
   amount (because they only worked part of the month) — this is
   expected and correct.
3. **Next month is completely normal** — a full month like everyone
   else, starting from the 1st. You don't need to do anything special
   for that.

---

## Step 5: Calculating and generating a payslip

At the bottom of the Salary page, under **"Calculate salary"**, pick a
month and year, then click **Calculate**. This shows you a full
breakdown — working days, present days, leave, absences, hours worked,
overtime, and the final amount — **without saving anything yet**. Use
this to double-check everything looks right.

Once you're happy with the numbers, click **"Generate payslip"**. This
saves it permanently in the **Payslip history** table below, and it's
what you'd actually use to pay the staff member.

### When should you generate the payslip?

**Wait until the month is fully over**, and make sure:
- All leave requests for that month have been approved or rejected (not
  left pending).
- Any missed check-outs or incorrect attendance entries for that month
  have already been corrected.

Generating a payslip *before* the month ends, or before attendance is
fully corrected, will give you an incomplete number — you'll need to
regenerate it later anyway.

### Can you regenerate a payslip?

Yes. If you generate a payslip for the same month again later (say,
after fixing an attendance mistake), it simply **replaces** the old
number for that month — it won't create a duplicate. This is safe to do
as many times as you need, right up until you've actually paid the
staff member.

---

## Quick troubleshooting

- **"No salary is configured for this staff member for that period"** —
  You haven't set up their pay yet, or their pay's "Effective from" date
  is *after* the month you're trying to calculate. Go configure their
  pay first.
- **Numbers look lower than expected** — check the breakdown for
  "Shortfall" hours (they left early on some days) or "Absent"/
  "Incomplete" days (missed check-outs need correcting).
- **Overtime isn't showing up in pay** — make sure you actually entered
  an "Overtime rate/hour" when configuring their pay. If it's blank,
  extra hours aren't paid extra.
- **A raise or change in hours** — just click "Configure pay" again with
  the new numbers and a new "Effective from" date. Old months keep using
  whatever was set up for them at the time — nothing in the past changes.
