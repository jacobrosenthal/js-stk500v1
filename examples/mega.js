var SerialPort = require("serialport");
var intel_hex = require('intel-hex');
var stk500 = require('../');
var async = require("async");
var fs = require('fs');

var usbttyRE = /(cu\.usb|ttyACM|COM\d+)/;

var data = fs.readFileSync('arduino-1.0.6/mega256/Blink.cpp.hex', { encoding: 'utf8' });

var hex = intel_hex.parse(data).data;

//TODO standardize chip configs
//uno
var pageSize = 256;
var baud = 115200;
var delay1 = 10; //minimum is 2.5us, so anything over 1 fine?
var delay2 = 1;
var signature = new Buffer([0x1e, 0x98, 0x01]);
var options = {
  timeout:0xc8,
  stabDelay:0x64,
  cmdexeDelay:0x19,
  synchLoops:0x20,
  byteDelay:0x00,
  pollValue:0x53,
  pollIndex:0x03
};

SerialPort.list(function (err, ports) {
  ports.forEach(function(port) {

    console.log("found " + port.comName);
 
  	if(usbttyRE.test(port.comName))
  	{

			console.log("trying" + port.comName);

			var serialPort = new SerialPort.SerialPort(port.comName, {
			  baudrate: baud,
			  parser: SerialPort.parsers.raw
			}, false);

  		var programmer = new stk500(serialPort);



  		async.series([
        programmer.connect.bind(programmer),
        programmer.reset.bind(programmer,delay1, delay2),
        programmer.sync.bind(programmer, 3),
        programmer.verifySignature.bind(programmer, signature),
        // programmer.setOptions.bind(programmer, options),
        programmer.enterProgrammingMode.bind(programmer, options),
        programmer.upload.bind(programmer, hex, pageSize),
        programmer.exitProgrammingMode.bind(programmer)
        
      ], function(error){

        programmer.disconnect(function(err){
          console.log(err);
        });

        if(error){
          console.log("programing FAILED: " + error);
          process.exit(1);
        }else{
          console.log("programing SUCCESS!");
          process.exit(0);
        }
  		});

    }else{
      console.log("skipping " + port.comName);
    }

  });
});

