const { Cron } = require('croner');
const logger = require('./logger');
const notifier = require('../utils/notifier');

function initScheduler(db, features, ctx) {
  const jobs = [];

  for (const [name, feature] of features) {
    if (!feature.schedules || feature.schedules.length === 0) continue;

    for (const schedule of feature.schedules) {
      const job = new Cron(schedule.cron, { timezone: schedule.tz || 'Asia/Jakarta' }, async () => {
        const now = new Date().toISOString();

        try {
          await schedule.run({ db, client: ctx.client, features });
          db.prepare('INSERT OR REPLACE INTO scheduled_runs (job_name, last_run_at) VALUES (?, ?)').run(schedule.name, now);
          logger.info(`Scheduler: job "${schedule.name}" completed`);
        } catch (err) {
          // Deliberately NOT writing scheduled_runs here: a failed job must not
          // look like a completed one on the next inspection.
          logger.error(`Scheduler: job "${schedule.name}" failed`, err);
          await notifier.alertJobFailure(schedule.name, err.message || String(err)).catch(() => {});
        }
      });

      jobs.push({ name: schedule.name, feature: name, job });
    }
  }

  logger.info(`Scheduler initialized (${jobs.length} jobs)`);
  return jobs;
}

module.exports = { initScheduler };
