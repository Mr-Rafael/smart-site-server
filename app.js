var express = require('express');
var async = require('async')
  , phoenix = require('phoenix-js')
  , app = express()
  , socket = new phoenix.Socket ( 'ws:back.lgb-smartsite.com:4000/socket' ,
    { transport: require ( 'websocket' ) .w3cwebsocket } )
  , meter = require('./controllers/meter.js')
  , CronJobManager = require('cron-job-manager')
  , timer = require('./controllers/readTime.js')
  ,   request = require('request');
var Agenda = require('agenda');
var shell = require('shelljs');
var jsonfile = require('jsonfile');
var bodyParser = require('body-parser');
app.use( bodyParser.json() );
var channels = [];
var SITE_METER = {};
var meters = [];
var MAKE_REQUESTS_TO_ARDUINO = true;
var gas_array = [];
var temp_array = [];
var MAX_DATA_POINTS_AVERAGE = 35;
var last_is_on = false;
var last_voltage = 0.0;
var last_time = Date.now();
var LOCALS_DIR = './locals/gas-meters.json';
var TIME_TO_SEND = 60000; // 1 Minute
var motor_time = 0;
var CONSUMPTION_RATE_PER_SECOND = 0.000236111;
function getChannel(id){
  for (var i = 0; i<channels.length; i++){
    if(id === channels[i].meter_id){
      return channels[i].channel;
    }
  }
  return undefined
}

function getMeterNames(){
  // Read from JSON the ids and ips of arduino gas meters.
  var fs = require('fs');
  var obj = JSON.parse(fs.readFileSync(LOCALS_DIR, 'utf8'));
  return obj
}

function findMeterData(id){

    for(var i =0; i<meters.length; i++){
        if(id == meters[i].id){
            return meters[i];
        }
    }
    return false;
}


app.listen(4000, function(){


    console.log("------------------*******************************************-------------------");
    console.log("------------------** Raspberry Fuel Manager Version: 1.0.0 **-------------------");
    console.log("------------------*******************************************-------------------");
    console.log("Listening 4000...");

    // Connect socket
    socket.connect();
    socket.onOpen(function(){
        console.log("connection open");
    });
    socket.onError(function(){ console.log("there was an error with the connection!")});
    socket.onClose(function(){
        console.log("DROP");
        socket.connect();
    });
    require('getmac').getMac(function(err,macAddress){
        if (err)  throw err;
        macAddress = macAddress.replace(/:/g, "");
        console.log("Getting mac: ");
        console.log(macAddress);
        // Write mac to JSON FILE
        meters[0].mac = macAddress;
        jsonfile.writeFile(LOCALS_DIR, meters, function (err) {
            if(err==null){
                SITE_METER= meters[0];
                console.log("Succesfully fetched mac address");
            }
        });
    });

    // Fetch meter ips and ids from json.
    meters = getMeterNames();
    SITE_METER= meters[0];



    var meterId = SITE_METER.mac;
    var meterIp = SITE_METER.ip;
    var url = meterIp+'/gas-level';
    var channelNameLobby = "site_room:"+"lobby";
    var channelName = "site_room:"+meterId;
    console.log("Connecting to:"+channelNameLobby);
    console.log("Connecting to:"+channelName);
    var channelLobby = socket.channel(channelNameLobby, {'mac': meterId});
    channelLobby.join()
        .receive("ok", function (resp) {
            console.log("CONNECTED TO " + channelNameLobby);
            console.log(resp);
        });
    var channel = socket.channel(channelName, {'mac': meterId});
    channels.push({channel: channel, meter_id: meterId});

    // Create channels for each meter
    async.map(channels,
      function(channel,cb) {

        channel['channel'].join()
        .receive("ok", function (resp) {
            var connectedId = channel['channel'].topic.split(":")[1];
            meter = findMeterData(parseInt(connectedId));
            console.log("CONNECTED TO " + channel['channel'].topic);
            console.log(resp);
        })

          // Error while connecting.
          .receive("error", function(err, cb){
              console.log("Connection error: "+err);
          });

          // Reboot Raspberry
          channel['channel'].on("gas_level:new_entry", function (resp) {


          });
          channel['channel'].on("reset", function (resp) {
              shell.exec("sudo reboot");


          });
          channel['channel'].on("update:tank", function (resp) {
            console.log(JSON.stringify(resp));
            var tank_diameter = resp.tank_diameter.toString();
            console.log(tank_diameter);
            var tank_length = resp.tank_length.toString();
            console.log(tank_length);
            var total_volume = resp.tank_capacity.toString();
            console.log(total_volume);
            console.log("-----------------------------------------UPDATING TANK-----------------------------------");
            console.log(JSON.parse(resp.tank_length));
            console.log(' http://'+SITE_METER.ip+'/configData');
            var curl = 'curl -H "Content-type: application/json" -X POST -d "{l:'+tank_length+', d:'+tank_diameter+', vol: '+total_volume+'}" http://192.168.2.102/configData';
            console.log(curl);
            var child = shell.exec(curl,
              {async:true});
            child.stdout.on('data', function(data) {
              if(data=='{success:true}'){
                console.log("Succesfully updated.");
                // Request to enpoint to save changes in database
                request({ url: 'http://'+'52.203.56.116:4000'+'/api/sensor/update_meter/'+SITE_METER.mac,
                  method: 'PUT',
                  json: {'meter':{
                        'tank_diameter': parseFloat(tank_diameter),
                        'tank_length': parseFloat(tank_length),
                        'tank_capacity': parseFloat(total_volume)
                        }
                  }},
                  function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                      console.log(body);
                    }
                    else{
                      console.log(response);
                    }

                })
              }
            });
          });
          channel['channel'].on("update:success:tank", function (resp) {
            console.log("-----------------------------------------UPDATING TANK SUCCESFULLY-----------------------------------");
            console.log(resp);


          });



      }, function(err, results) {
            console.log("Finished connecting to all channels");


        });



    function failGracefully() {
        console.log('Something is gonna blow up.');
        process.exit(0);
    }

    process.on('SIGTERM', failGracefully);
    process.on('SIGINT', failGracefully);

    // ROUTES:
    app.post('/set-motor', function(req, res){
        console.log(req.body);
        if((req.body.is_on == true || req.body.is_on == false) && req.body.meter_id){
            // Create websocket request.

            channel = getChannel(SITE_METER.mac);
            if (channel){
                channel.push('motor:state', {'motor':req.body, 'meter_id': SITE_METER.mac}, 15000)
                    .receive("ok", function(msg){ console.log("created message", msg) })
                    .receive("error", function(reasons){console.log("Failed to save data.", reasons)} )
                    .receive("timeout", function(){console.log("Networking issue...")} );




                return res.sendStatus(200);
            }

        }
        else if(!req.body.is_on && req.body.meter_id){
            channel = getChannel(SITE_METER.mac);
            channel.push('motor:state', {'motor':req.body}, 15000)
                .receive("ok", function(msg){console.log("created message", msg)})
                .receive("error", function(msg){console.log("Failed to save data. ", reaseons)})
                .receive("timeout",function(){console.log("Networking issue...")});
        }
        else{
            console.log("bad request: "+JSON.stringify(req.body));
            return res.status(400).json({'error':'Needed is_on and meter_id'});
        }


    });

    // ROUTES:
    app.post('/send-gas-level', function(req, res){
        console.log("--> Fuel Entry Received: ");
        console.log(req.body);
        if(req.body.level){
            var level = req.body.level;
            if (level > 10000){
                level = 10000;
            }
			
			var temp = shell.cat('/sys/class/thermal/thermal_zone0/temp') / 1000.0;
			console.log("Temperature: ");
			console.log(temp);

            channel = getChannel(SITE_METER.mac);
            if(MAX_DATA_POINTS_AVERAGE > gas_array.length){

                gas_array.push(level);
				temp_array.push(temp);
				
                // console.log(gas_array);
            }
            else{
                gas_array.shift();
				temp_array.shift();
                gas_array.push(level);
				temp_array.push(temp);
                // Getting average
                var sum = 0;
                for( var i = 0; i < gas_array.length; i++ ){
                    sum += parseFloat( gas_array[i]); //don't forget to add the base
                }

                // console.log(gas_array);
                var avg = sum/gas_array.length;
				
				for ( var i = 0; i < temp_array.length; i++ ){
					sum += parseFloat( temp_array[i]);
				}
				
				var temp = sum/temp_array.length;
				
                console.log("LAST VOLTAGE");
                console.log(last_voltage);
                var data = {
                    entry: {
                        meter_id: SITE_METER.mac,
                        volume: parseFloat(avg) + 0.01,
                        is_on: last_is_on,
                        voltage: parseFloat(last_voltage) + 0.01,
                        temperature: parseFloat(temp) + 0.01,
                        motor_time: motor_time,
                        motor_consumption: CONSUMPTION_RATE_PER_SECOND*motor_time
                    }
                };
                // Reset array and motor time.
                gas_array = [];
                motor_time = 0;
                channel.push('gas_level:new_entry', data)
                    .receive("ok", function(msg){ console.log("--SENT MESSAGE TO SERVER--", data) })
                    .receive("error", function(reasons){console.log("Failed to save data.", reasons)} )
                    .receive("timeout", function(){console.log("Networking issue...")} )
                    .after(5000, function(){
                        console.log("-----------TIMEOOUT---------------");
                        socket.onClose(function(){});
                        socket.pushBuffer = [];
						socket.connect();
						shell.exec("sudo reboot");
		socket.onOpen(function(){
        console.log("connection open");
    });
    socket.onError(function(){ console.log("there was an error with the connection!")});
    socket.onClose(function(){
        console.log("DROP");
        socket.connect();
    });

                    });
            }

        }
        return res.status(200).json({'msg':'OK.'});

    });

    // ROUTES:
    app.post('/send-voltage-battery', function(req, res){
		
        // Accumulate timer
        if (req.body.is_on != 0){
            motor_time += 2;
        }
        last_voltage = req.body.battery_voltage;
        console.log(req.body);
        var test_is_on = false;
        if(req.body.is_on == 1){
            test_is_on = true;
        }
        else{
            test_is_on = false;
        }
        if (test_is_on != last_is_on){
			
			console.log("Generator has changed state.");
			
			channel = getChannel(SITE_METER.mac);
			
            // Send the change through socket and update variables.
            if(req.body.is_on == 1){
                last_is_on = true;
            }
            else{
                last_is_on = false;
            }
			
			console.log("Lookin good.");
				
            if (channel){
                channel.push('motor:state', {'motor': { 'is_on': req.body.is_on, 'meter_id': req.body.meter_id }, 'meter_id': SITE_METER.mac}, 15000)
                    .receive("ok", function(msg){ console.log("created message", msg) })
                    .receive("error", function(reasons){console.log("Failed to save data.", reasons)} )
                    .receive("timeout", function(){console.log("Networking issue...")} );




                return res.sendStatus(200);
            }
			
			console.log("Still running.");
			
            last_voltage = req.body.battery_voltage;

            var now =Date.now();
            last_time = now;
        }
        else{
            var now =Date.now();
            if(now - last_time >= TIME_TO_SEND ){
                // Send through socket and update variables
                last_time = now;
                if(req.body.is_on == 0){
                    last_is_on = false;
                }
                else{
                    last_is_on = true;
                }

            }
        }

        return res.status(200).json({'msg':'OK.'});

    });
});
