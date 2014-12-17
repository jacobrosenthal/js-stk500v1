//use strict might have screwed up my this context, or might not have..
// var serialPort = require("serialport");
var async = require("async");

var Statics = require('./statics');
var sendCommand = require('./sendCommand');

var memtype = 0x46;
var timeout = 400;

var _options = {
  devicecode:0,
  revision:0,
  progtype:0,
  parmode:0,
  polling:0,
  selftimed:0,
  lockbytes:0,
  fusebytes:0,
  flashpollval1:0,
  flashpollval2:0,
  eeprompollval1:0,
  eeprompollval2:0,
  pagesizehigh:0,
  pagesizelow:0,
  eepromsizehigh:0,
  eepromsizelow:0,
  flashsize4:0,
  flashsize3:0,
  flashsize2:0,
  flashsize1:0
};

//todo abstract out chrome and take serial object shim
function stk500(port) {
	// if (!(this instanceof stk500))
	// return new stk500();
	console.log("constructed");
	this.serialPort = port;
};


stk500.prototype.sync = function(attempts, done) {
	console.log("sync");
	var self = this;
	var tries = 1;

  var opt = {
    cmd: [
      Statics.Cmnd_STK_GET_SYNC
    ],
    responseData: Statics.OK_RESPONSE,
    timeout: timeout
  };
  function attempt () {
		tries=tries+1;
    sendCommand(self.serialPort, opt, function (err, data) {
			if (err && tries <= attempts) {
        if (err) {
          console.log(err);
          console.error(err.stack);
        }
				console.log("failed attempt again", tries);
				return attempt();
      }
      console.log('sync complete', err, data, tries);
      done(err, data);
    });
  }
  attempt();
};

stk500.prototype.verifySignature = function(signature, done) {
	console.log("verify signature");
	var self = this;
	match = Buffer.concat([
    new Buffer([Statics.Resp_STK_INSYNC]),
    signature,
    new Buffer([Statics.Resp_STK_OK])
  ]);

  var opt = {
    cmd: [
      Statics.Cmnd_STK_READ_SIGN
    ],
    responseLength: 5,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log('confirm signature', err, data, data.toString('hex'));
    done(err, data);
  });
};

stk500.prototype.getSignature = function(done) {
	console.log("verify signature");
  var opt = {
    cmd: [
      Statics.Cmnd_STK_READ_SIGN
    ],
    responseLength: 5,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
    console.log('getSignature', err, data);
    done(err, data);
  });
};

stk500.prototype.setOptions = function(options, done) {
	console.log("set device");
	var self = this;

	options.devicecode = options.devicecode || _options.devicecode;
	options.revision = options.revision || _options.revision;
	options.progtype = options.progtype || _options.progtype;
	options.parmode = options.parmode || _options.parmode;
	options.polling = options.polling || _options.polling;
	options.selftimed = options.selftimed || _options.selftimed;
	options.lockbytes = options.lockbytes || _options.lockbytes;
	options.fusebytes = options.fusebytes || _options.fusebytes;
	options.flashpollval1 = options.flashpollval1 || _options.flashpollval1;
	options.flashpollval2 = options.flashpollval2 || _options.flashpollval2;
	options.eeprompollval1 = options.eeprompollval1 || _options.eeprompollval1;
	options.eeprompollval2 = options.eeprompollval2 || _options.eeprompollval2;
	options.pagesizehigh = options.pagesizehigh || _options.pagesizehigh;
	options.pagesizelow = options.pagesizelow || _options.pagesizelow;
	options.eepromsizehigh = options.eepromsizehigh || _options.eepromsizehigh;
	options.eepromsizelow = options.eepromsizelow || _options.eepromsizelow;
	options.flashsize4 = options.flashsize4 || _options.flashsize4;
	options.flashsize3 = options.flashsize3 || _options.flashsize3;
	options.flashsize2 = options.flashsize2 || _options.flashsize2;
	options.flashsize1 = options.flashsize1 || _options.flashsize1;

  var opt = {
    cmd: [
      Statics.Cmnd_STK_SET_DEVICE,
      options.devicecode,
      options.revision,
      options.progtype,
      options.parmode,
      options.polling,
      options.selftimed,
      options.lockbytes,
      options.fusebytes,
      options.flashpollval1,
      options.flashpollval2,
      options.eeprompollval1,
      options.eeprompollval2,
      options.pagesizehigh,
      options.pagesizelow,
      options.eepromsizehigh,
      options.eepromsizelow,
      options.flashsize4,
      options.flashsize3,
      options.flashsize2,
      options.flashsize1
    ],
    responseData: Statics.OK_RESPONSE,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
    console.log('setOptions', err, data);
    if (err) {
      return done(err);
    }
    done();
  });
};

stk500.prototype.enterProgrammingMode = function(done) {
	console.log("send enter programming mode");
  var opt = {
    cmd: [
      Statics.Cmnd_STK_ENTER_PROGMODE
    ],
    responseData: Statics.OK_RESPONSE,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log("sent enter programming mode", err, data);
    done(err, data);
  });
};

stk500.prototype.loadAddress = function(useaddr, done) {
	console.log("load address");
	var addr_low = useaddr & 0xff;
	var addr_high = (useaddr >> 8) & 0xff;
  var opt = {
    cmd: [
      Statics.Cmnd_STK_LOAD_ADDRESS,
      addr_low,
      addr_high
    ],
    responseData: Statics.OK_RESPONSE,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log('loaded address', err, data);
    done(err, data);
  });
};

stk500.prototype.loadPage = function(writeBytes, done) {
	console.log("load page");
	var bytes_low = writeBytes.length & 0xff;
	var bytes_high = writeBytes.length >> 8;

	var cmd = Buffer.concat([
    new Buffer([Statics.Cmnd_STK_PROG_PAGE, bytes_high, bytes_low, memtype]),
    writeBytes,
    new Buffer([Statics.Sync_CRC_EOP])
  ]);

  var opt = {
    cmd: cmd,
    responseData: Statics.OK_RESPONSE,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log('loaded page', err, data);
    done(err, data);
  });
};

stk500.prototype.upload = function(hex, pageSize, done) {
	console.log("program");

	var pageaddr = 0;
	var writeBytes;
	var useaddr;

	var self = this;

	// program individual pages
  async.whilst(
    function() { return pageaddr < hex.length; },
    function(pagedone) {
			console.log("program page");
      async.series([
      	function(cbdone){
      		useaddr = pageaddr >> 1;
      		cbdone();
      	},
      	function(cbdone){
      		self.loadAddress(useaddr, cbdone);
      	},
        function(cbdone){

					writeBytes = hex.slice(pageaddr, (hex.length > pageSize ? (pageaddr + pageSize) : hex.length - 1))
        	cbdone();
        },
        function(cbdone){
        	self.loadPage(writeBytes, cbdone);
        },
        function(cbdone){
					console.log("programmed page");
        	pageaddr =  pageaddr + writeBytes.length;
        	setTimeout(cbdone, 4);
        }
      ],
      function(error) {
      	console.log("page done");
      	pagedone(error);
      });
    },
    function(error) {
    	console.log("upload done");
    	done(error);
    }
  );
};

stk500.prototype.exitProgrammingMode = function(done) {
	console.log("send leave programming mode");
  var opt = {
    cmd: [
      Statics.Cmnd_STK_LEAVE_PROGMODE
    ],
    responseData: Statics.OK_RESPONSE,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log('sent leave programming mode', err, data);
    done(err, data);
  });
};

stk500.prototype.verify = function(hex, done) {
	// console.log("verify");
	// var self = this;

	// serial.send([Cmnd_STK_LOAD_ADDRESS, addr_low, addr_high, Sync_CRC_EOP]) n times
	// self.matchReceive([Resp_STK_INSYNC, Resp_STK_OK]);
	// serial.send ([Cmnd_STK_READ_PAGE, bytes_high, bytes_low, memtype, Sync_CRC_EOP]) n times
	// self.matchReceive([Resp_STK_INSYNC].concat(writeBytes));
	done();
};

//todo convenience function
stk500.prototype.bootload = function (chip, hex, done){
	done();
};

// export the class
module.exports = stk500;