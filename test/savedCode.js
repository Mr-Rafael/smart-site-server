var data = ''

meter.getResponse(function(str) {
  data = JSON.parse(str)

  var test = {
    entry: {
      meter_id: 1,
      sonnar: data['sonnar'],
      temperature: data['temperature']
    }
  }

  channel.push('create:entry', test)
  console.log("Created entry") 
