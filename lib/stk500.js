//use strict might have screwed up my this context, or might not have.. 
// var serialPort = require("serialport");
var async = require("async");
var bufferEqual = require('buffer-equal');
var CBuffer = require('CBuffer');

var CMD_SIGN_ON = 0x01;
var CMD_LOAD_ADDRESS = 0x06;
var CMD_ENTER_PROGMODE_ISP = 0x10;
var CMD_LEAVE_PROGMODE_ISP = 0x11;
var CMD_PROGRAM_FLASH_ISP = 0x13;
var CMD_SPI_MULTI = 0x1D;

var timeout = 500;

var _options = {
  timeout:0xc8,
  stabDelay:0x64,
  cmdexeDelay:0x19,
  synchLoops:0x20,
  byteDelay:0x00,
  pollValue:0x53,
  pollIndex:0x03
};

//todo abstract out chrome and take serial object shim
function stk500(port) {
  if (!(this instanceof stk500))
  return new stk500();

  var self = this;

  self.blSeq = 0;

  self.serialPort = port;

  self.received = new CBuffer(300);

  this.onDataCallback = function(data) {
    // console.log("received " + data.toString('hex'));
    for (var i = 0; i< data.length; i++){
      self.received.push(data[i]);
    }
  };
}

stk500.prototype.matchReceive = function(match, timeout, callback){
  console.log("matching");

  var self = this;

  self.getBytes(match.length, timeout, function(error, data){

    if(error)
    {
      callback(error);
    }else{
      var err = null;

      if(bufferEqual(data, match)){
        // console.log(match.toString('hex') + "==" + data.toString('hex'));
      }else{
        // console.log(match.toString('hex') + "!=" + data.toString('hex'));
        err = new Error("No Match");
        err.name = "INVALID";
      }
      callback(err, data);
    }

  });

};

stk500.prototype.getBytes = function(numberBytes, callback){
  var self = this;

  if(self.received.size>=numberBytes){
    var received_copy = new Buffer(self.received.size);
    for(var i = 0; i< numberBytes; i++){
      received_copy[i] = self.received.shift();
    }
    callback(null, received_copy);
  }
  else
  {
    callback("not enough", null);
  }

};

//todo use error
stk500.prototype.connect = function(done) {
  console.log("connect");

  var self = this;

  this.serialPort.open(function (error) {

    if ( error ) {
      console.log('failed to connect: ' + error);
      return done(error);
    }
    console.log('connected');

    self.received.empty();

    self.serialPort.on('data', self.onDataCallback);
    done();

  });

};

//todo can this timeout? or fail?
stk500.prototype.disconnect = function(done) {
  console.log("disconnect");

  var self = this;

  self.serialPort.removeListener('data', self.onDataCallback);

  self.serialPort.close(function (error) {
    if ( error ) {
      console.log('failed to close: ' + error);
      return done(error);
    }

    console.log('closed');
    done();
  });

};

stk500.prototype.reset = function(delay1, delay2, done){
  console.log("reset");

  var self = this;

  async.series([
    function(cbdone) {
      console.log("asserting");
      self.serialPort.set({rts:true, dtr:true}, function(result){
        console.log("asserted");
        if(result) return cbdone(result);
        cbdone();
      });
    },
    function(cbdone) {
      console.log("wait");
      setTimeout(cbdone, delay1);
    },
    function(cbdone) {
      console.log("clearing");
      self.serialPort.set({rts:false, dtr:false}, function(result){
        console.log("clear");
        if(result) return cbdone(result);
        cbdone();
      });
    },
    function(cbdone) {
      console.log("wait");
      setTimeout(cbdone, delay2);
    }],
    function(error) {
      done(error);
    }
  );
};

stk500.prototype.sync = function(attempts, done) {
  console.log("sync");
  var self = this;
  var tries = 1;

  var cmd = new Buffer([CMD_SIGN_ON]);

  attempt();
  function attempt(){
    tries=tries+1;

    self.sendBootloadCommand(cmd, function(error, results){
      console.log("confirm sync");
      // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
        if(error) {
          if(tries<=attempts){
            console.log("failed attempt again");
            attempt();
          }else{
            return done(error);
          }
        }else{
          console.log("confirmed sync");
          done();
        }
      // });
    });
  }
};

stk500.prototype.sendBootloadCommand = function(msg, done) {

  var bufLen = 6 + msg.length;
  var buffer = new ArrayBuffer(bufLen);
  var dv = new DataView(buffer);
  var checksum = 0;
  dv.setUint8(0, 0x1b);
  checksum ^= 0x1b;
  dv.setUint8(1, this.blSeq);
  checksum ^= this.blSeq;
  dv.setUint16(2, msg.length, false);
  checksum ^= dv.getUint8(2);
  checksum ^= dv.getUint8(3);
  dv.setUint8(4, 0x0e);
  checksum ^= dv.getUint8(4);
  for (var x = 0; x < msg.length; ++x) {
    dv.setUint8(5 + x, msg[x]);
    checksum ^= msg[x];
  }
  dv.setUint8(bufLen - 1, checksum);

  ++this.blSeq;
  if (this.blSeq > 0xff) this.blSeq = 0;

  var dater = toBuffer(buffer);

  // console.log(dater.toString('hex'));

  this.serialPort.write(dater, function(error, results) {
    this.readBootloadCommand(timeout, done);
  }.bind(this));
};

var cmdReadStates = ["Start", "GetSequenceNumber", "GetMessageSize1", "GetMessageSize2", "GetToken", "GetData", "GetChecksum", "Done"];
stk500.prototype.readBootloadCommand = function(timeout, cbDone) {
  var self = this;
  var state = 0;
  var timedout = false;
  var pkt = {
    message : [],
    messageLen : [],
    checksum:0
  };
  if (typeof timeout === "function") {
    cbDone = timeout;
    timeout = undefined;
  }
  if (timeout === undefined) timeout = 500;
  setTimeout(function() { timedout = true; }, timeout);
  async.whilst (function() {
    return state < (cmdReadStates.length - 1) && !timedout;
  }, function(cbStep) {
    self.getBytes(1, function(err, data) {
      var curByte;
      if(data && data.length>0)
      {
        curByte = data[0];
      }
      if (!err) {
        console.log("Read: state(%s) byte(%d) char(%s)", cmdReadStates[state], curByte, String.fromCharCode(curByte));
      } else {
        // console.log("There was no data yet, waiting for some");
        return setTimeout(cbStep, 10);
      }
      pkt.checksum ^= curByte;
      switch(state) {
      case 0:
        if (curByte != 0x1b) {
          return cbStep("Invalid header byte expected 27 got: " + curByte);
        }
        ++state;
        break;
      case 1:
        var prevSeq = self.blSeq - 1;
        if (prevSeq == -1) prevSeq = 255;
        if (curByte != prevSeq) {
          return cbStep("Invalid sequence number");
        }
        ++state;
        break;
      case 2:
        pkt.messageLen.push(curByte);
        ++state;
        break;
      case 3:
        pkt.messageLen.push(curByte);
        pkt.messageLen = (pkt.messageLen[0] << 8) | pkt.messageLen[1];
        ++state;
        break;
      case 4:
        if (curByte != 0x0e) {
          return cbStep("Invalid message marker byte");
        }
        ++state;
        break;
      case 5:
        if (--pkt.messageLen === 0) ++state;
        pkt.message.push(curByte);
        break;
      case 6:
        pkt.checksum ^= curByte;
        pkt.checksum = (pkt.checksum == curByte) ? true : false;
        ++state;
        break;
      }
      cbStep();
    });

  }, function(err) {
    if(!err && timedout){
      return cbDone(new Error("Timed out waiting for response"), pkt);
    }

    cbDone(err, pkt);
  });
};

stk500.prototype.verifySignature = function(signature, done) {
  console.log("verify signature");

  this.getSignature(function(error, reportedSignature){

    console.log(reportedSignature);
    console.log(signature);
    if(!bufferEqual(signature, reportedSignature)){
      return done(new Error("signature doesnt match. Found: " + reportedSignature.toString('hex'), error));
    }

    done();

  });
};

stk500.prototype.getSignature = function(done) {
  console.log("read signature");
  var self = this;

  var reportedSignature = new Buffer(3);

    async.series([
      function(cbdone){

        var numTx = 0x04;
        var numRx = 0x04;
        var rxStartAddr = 0x00;

        var cmd = new Buffer([CMD_SPI_MULTI, numTx, numRx, rxStartAddr, 0x30, 0x00, 0x00, 0x00]);

        self.sendBootloadCommand(cmd, function(error, pkt) {
          console.log("sent sig1");

          if (pkt && pkt.message && pkt.message.length >= 6)
          {
            var sig = pkt.message[5];
            reportedSignature.writeUInt8(sig, 0);
          }

          // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
            cbdone(error);
          // });
        });

      },
      function(cbdone){

        var numTx = 0x04;
        var numRx = 0x04;
        var rxStartAddr = 0x00;

        var cmd = new Buffer([CMD_SPI_MULTI, numTx, numRx, rxStartAddr, 0x30, 0x00, 0x01, 0x00]);

        self.sendBootloadCommand(cmd, function(error, pkt) {
          console.log("sent sig2");

          if (pkt && pkt.message && pkt.message.length >= 6)
          {
            var sig = pkt.message[5];
            reportedSignature.writeUInt8(sig, 1);
          }

          // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
            cbdone(error);
          // });
        });

      },
      function(cbdone){

        var numTx = 0x04;
        var numRx = 0x04;
        var rxStartAddr = 0x00;

        var cmd = new Buffer([CMD_SPI_MULTI, numTx, numRx, rxStartAddr, 0x30, 0x00, 0x02, 0x00]);

        self.sendBootloadCommand(cmd, function(error, pkt) {
          console.log("sent sig3");

          if (pkt && pkt.message && pkt.message.length >= 6)
          {
            var sig = pkt.message[5];
            reportedSignature.writeUInt8(sig, 2);
          }

          // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
            cbdone(error);
          // });
        });

      }
    ],
    function(error) {
      console.log("read signature done");
      done(error, reportedSignature);
    });

};


stk500.prototype.enterProgrammingMode = function(options, done) {
  console.log("send enter programming mode");

  var self = this;

  var args = Array.prototype.slice.call(arguments);
  done = args.pop();
  if (typeof(done) !== 'function') {
    done = null;
  }

  options = (typeof options !== 'function') && options || {};

  options.timeout = options.timeout || _options.timeout;
  options.stabDelay = options.stabDelay || _options.stabDelay;
  options.cmdexeDelay = options.cmdexeDelay || _options.cmdexeDelay;
  options.synchLoops = options.synchLoops || _options.synchLoops;
  options.byteDelay = options.byteDelay || _options.byteDelay;
  options.pollValue = options.pollValue || _options.pollValue;
  options.pollIndex = options.pollIndex || _options.pollIndex;

  var cmd1 = 0xac;
  var cmd2 = 0x53;
  var cmd3 = 0x00;
  var cmd4 = 0x00;

  var cmd = new Buffer([CMD_ENTER_PROGMODE_ISP, options.timeout, options.stabDelay, options.cmdexeDelay, options.synchLoops, options.byteDelay, options.pollValue, options.pollIndex, cmd1, cmd2, cmd3, cmd4]);

  self.sendBootloadCommand(cmd, function(error, results) {
    console.log("sent enter programming mode");
    // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
      done(error);
    // });
  });
};


stk500.prototype.loadAddress = function(useaddr, done) {
  console.log("load address");
  var self = this;

  msb = (useaddr >> 24) & 0xff | 0x80;
  xsb = (useaddr >> 16) & 0xff;
  ysb = (useaddr >> 8) & 0xff;
  lsb = useaddr & 0xff;

  var cmdBuf = new Buffer([CMD_LOAD_ADDRESS, msb, xsb, ysb, lsb]);

  self.sendBootloadCommand(cmdBuf, function(error, results) {
    console.log("confirm load address");
    // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
      done(error);
    // });

  });

};


stk500.prototype.loadPage = function(writeBytes, done) {
  console.log("load page");
  var self = this;

  var bytesMsb = writeBytes.length >> 8; //Total number of bytes to program, MSB first
  var bytesLsb = writeBytes.length & 0xff; //Total number of bytes to program, MSB first
  var mode = 0xc1; //paged, rdy/bsy polling, write page
  var delay = 0x0a; //Delay, used for different types of programming termination, according to mode byte
  var cmd1 = 0x40; // Load Page, Write Program Memory
  var cmd2 = 0x4c; // Write Program Memory Page
  var cmd3 = 0x20; //Read Program Memory
  var poll1 = 0x00; //Poll Value #1
  var poll2 = 0x00; //Poll Value #2 (not used for flash programming)


  var cmdBuf = new Buffer([CMD_PROGRAM_FLASH_ISP, bytesMsb, bytesLsb, mode, delay, cmd1, cmd2, cmd3, poll1, poll2]);

  cmdBuf = Buffer.concat([cmdBuf,writeBytes]);

  self.sendBootloadCommand(cmdBuf, function(error, results) {
    console.log("loaded page");

    // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
      done(error);
    // });

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

          writeBytes = hex.slice(pageaddr, (hex.length > pageSize ? (pageaddr + pageSize) : hex.length - 1));
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
  var self = this;

  var preDelay = 0x01;
  var postDelay = 0x01;

  var cmd = new Buffer([CMD_LEAVE_PROGMODE_ISP, preDelay, postDelay]);

  self.sendBootloadCommand(cmd, function(error, results) {
    console.log("sent leave programming mode");
    // self.matchReceive(new Buffer([Resp_STK_INSYNC, Resp_STK_OK]), timeout, function(error){
      done(error);
    // });
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

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        buffer[i] = view[i];
    }
    return buffer;
}

// export the class
module.exports = stk500;