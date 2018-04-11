var CronJob = require('cron').CronJob;
new CronJob('*/10 * * * * *', function() {
  console.log('You will see this message every 10 second(s)');
}, null, true, 'America/Los_Angeles');
