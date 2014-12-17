var SerialPort = require("serialport");
var intel_hex = require('intel-hex');
var stk500 = require('../');
var async = require("async");
var fs = require('fs');

var usbttyRE = /(cu\.usb|ttyACM|COM\d+)/;

var data = fs.readFileSync('arduino-1.0.6/uno/StandardFirmata.cpp.hex', { encoding: 'utf8' });

var hex = intel_hex.parse(data).data;

var uno = {
  baud: 115200,
  signature: new Buffer([0x1e, 0x95, 0x0f]),
  pageSize: 128,
  timeout: 400
};

SerialPort.list(function (err, ports) {
  ports.forEach(function(port) {

    console.log("found " + port.comName);
 
  	if(usbttyRE.test(port.comName))
  	{

			console.log("trying" + port.comName);

			var serialPort = new SerialPort.SerialPort(port.comName, {
			  baudrate: uno.baud,
			  parser: SerialPort.parsers.raw
			});

      serialPort.on('open', function(){

        var programmer = new stk500(serialPort);

        programmer.bootload(hex, uno, function(error){

          serialPort.close(function (error) {
            console.log(error);
          });

          if(error){
            console.log("programing FAILED: " + error);
            process.exit(1);
          }else{
            console.log("programing SUCCESS!");
            process.exit(0);
          }

        });

      });

    }else{
      console.log("skipping " + port.comName);
    }

  });
});

