var express = require("express")
  , CronJobManager = require('cron-job-manager')
  , https = require('http')

callback = function(response) {
  var str = ''

  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk
  })

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {
    console.log(str)

    data = JSON.parse(str)

    var info = {
      entry: {
        meter_id: '1',
        sonnar: parseFloat(data['sonnar']),
        temperature: parseFloat(data['temperature'])
      }
    }

    channel.push('create:entry', info)
    //return str
  })

  return str
}

module.exports = {
  // Create manager will initialize the manager
  // to work with. Just call it once. JUST. ONCE.
  createManager: function(channel) {
    var manager = new CronJobManager(
      '_initial_',
      '*/1 * * * * *',
      function() {
        var options = {
          host: '192.168.2.101',
	  port: 80,
          path: '/gas-level'
        }

        // Here I make the response
        https.request(options, callback).end()

      },
      {
        start: true
      }
    )
    return manager
  },

  // Make job, function will get a manager
  // as parameter and return the manager with the
  // new job created.
  makeJob: function(manager, key, time, task) {
    // Validate for existing jobs
    if (manager.exists(key)) {

      console.log("key exists")
      return manager
    } else {

      // Create the job
      manager.add(
        key,
        time,
        task,
        {
          start: true
        }
      )
      // Start the task
      manager.start(key)

      // Return the manager.
      return manager
    }
  },

  // Update job, function will get a manager
  // as a parameter, update the desired task
  // and return the manager updated.
  updateJob: function(manager, key, time) {
    // Update the job.
    manager.update(
      key,
      time
    )

    // Return the manager.
    return manager
  },

  // Delete job, function will get a manager
  // as a parameter, delete the desire task
  // and return the manager updated.
  deleteJob: function(manager, key) {
    // Update the job.
    manager.delete(key)

    // Return the manager.
    return manager
  },
}
