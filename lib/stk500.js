var async = require("async");
var bufferEqual = require('buffer-equal');

var Statics = require('./statics');
var sendCommand = require('./sendCommand');

//todo abstract out chrome and take serial object shim
function stk500(port) {
	// if (!(this instanceof stk500))
	// return new stk500();
	console.log("constructed");
	this.serialPort = port;
};

stk500.prototype.sync = function(attempts, timeout, done) {
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

stk500.prototype.verifySignature = function(signature, timeout, done) {
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
    responseLength: match.length,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log('confirm signature', err, data, data.toString('hex'));
    done(err, data);
  });
};

stk500.prototype.getSignature = function(done, timeout) {
	console.log("get signature");
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

stk500.prototype.setOptions = function(options, timeout, done) {
	console.log("set device");
	var self = this;
	
  var opt = {
    cmd: [
      Statics.Cmnd_STK_SET_DEVICE,
      options.devicecode || 0,
      options.revision || 0,
      options.progtype || 0,
      options.parmode || 0,
      options.polling || 0,
      options.selftimed || 0,
      options.lockbytes || 0,
      options.fusebytes || 0,
      options.flashpollval1 || 0,
      options.flashpollval2 || 0,
      options.eeprompollval1 || 0,
      options.eeprompollval2 || 0,
      options.pagesizehigh || 0,
      options.pagesizelow || 0,
      options.eepromsizehigh || 0,
      options.eepromsizelow || 0,
      options.flashsize4 || 0,
      options.flashsize3 || 0,
      options.flashsize2 || 0,
      options.flashsize1 || 0
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

stk500.prototype.enterProgrammingMode = function(timeout, done) {
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

stk500.prototype.loadAddress = function(useaddr, timeout, done) {
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

stk500.prototype.loadPage = function(writeBytes, timeout, done) {
	console.log("load page");
	var bytes_low = writeBytes.length & 0xff;
	var bytes_high = writeBytes.length >> 8;

	var cmd = Buffer.concat([
    new Buffer([Statics.Cmnd_STK_PROG_PAGE, bytes_high, bytes_low, 0x46]),
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

stk500.prototype.upload = function(hex, pageSize, timeout, done) {
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
      		self.loadAddress(useaddr, timeout, cbdone);
      	},
        function(cbdone){

					writeBytes = hex.slice(pageaddr, (hex.length > pageSize ? (pageaddr + pageSize) : hex.length - 1))
        	cbdone();
        },
        function(cbdone){
        	self.loadPage(writeBytes, timeout, cbdone);
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

stk500.prototype.exitProgrammingMode = function(timeout, done) {
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

stk500.prototype.verify = function(hex, pageSize, timeout, done) {
	console.log("verify");

	var pageaddr = 0;
	var writeBytes;
	var useaddr;

	var self = this;

	// verify individual pages
  async.whilst(
    function() { return pageaddr < hex.length; },
    function(pagedone) {
			console.log("verify page");
      async.series([
      	function(cbdone){
      		useaddr = pageaddr >> 1;
      		cbdone();
      	},
      	function(cbdone){
      		self.loadAddress(useaddr, timeout, cbdone);
      	},
        function(cbdone){

					writeBytes = hex.slice(pageaddr, (hex.length > pageSize ? (pageaddr + pageSize) : hex.length - 1))
        	cbdone();
        },
        function(cbdone){
        	self.verifyPage(writeBytes, pageSize, timeout, cbdone);
        },
        function(cbdone){
					console.log("verified page");
        	pageaddr =  pageaddr + writeBytes.length;
        	setTimeout(cbdone, 4);
        }
      ],
      function(error) {
      	console.log("verify done");
      	pagedone(error);
      });
    },
    function(error) {
    	console.log("verify done");
    	done(error);
    }
  );
};

stk500.prototype.verifyPage = function(writeBytes, pageSize, timeout, done) {
	console.log("verify page");
	var self = this;
	match = Buffer.concat([
    new Buffer([Statics.Resp_STK_INSYNC]),
    writeBytes,
    new Buffer([Statics.Resp_STK_OK])
  ]);

	var size = writeBytes.length >= pageSize ? pageSize : writeBytes.length;

  var opt = {
    cmd: [
      Statics.Cmnd_STK_READ_PAGE,
      (size>>8) & 0xff,
      size & 0xff,
      0x46
    ],
    responseLength: match.length,
    timeout: timeout
  };
  sendCommand(this.serialPort, opt, function (err, data) {
		console.log('confirm page', err, data, data.toString('hex'));
    done(err, data);
  });
};

//todo convenience function
stk500.prototype.bootload = function (hex, opt, done){

  var parameters = {
    pagesizehigh: (opt.pagesizehigh<<8 & 0xff),
    pagesizelow: opt.pagesizelow & 0xff
  }

  async.series([
    this.sync.bind(this, 3, opt.timeout),
    this.verifySignature.bind(this, opt.signature, opt.timeout),
    this.setOptions.bind(this, parameters, opt.timeout),
    this.enterProgrammingMode.bind(this, opt.timeout),
    this.upload.bind(this, hex, opt.pageSize, opt.timeout),
    this.verify.bind(this, hex, opt.pageSize, opt.timeout),
    this.exitProgrammingMode.bind(this, opt.timeout)
  ], function(error){
  	return done(error);
  });
};

// export the class
module.exports = stk500;