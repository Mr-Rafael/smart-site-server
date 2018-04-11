var fs = require('fs')
  , request = require('request')

// This function will read de local data file to get the current ID for the arduino.
getIDs = function() {
  // The ID
  var id = ''
  // Read the local file to backup.
  fs.readFile('../locals/locals_IDs.info', 'utf8', function(err, data) {
    if (err) {
      return console.log(err)
    }
    id = data
  });

  return id
};

// Global string response from callback.
var str = '';

module.exports = {
  // export the str value
  str: str,
  // export the response function to other modules.
  getResponse: function(responseCallback) {
    request('http://192.168.19.120/gas-level', function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log(body); // Print the google web page.
        responseCallback(body)
      }
    })
  }
}
