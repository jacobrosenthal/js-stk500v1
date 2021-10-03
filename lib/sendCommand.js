var receiveData = require('./receiveData');
var Statics = require('./statics');

module.exports = function (stream, opt, callback) {
  var timeout = opt.timeout || 0;
  var startingBytes = [
    Statics.Resp_STK_INSYNC,
    Statics.Resp_STK_NOSYNC
  ];
  var responseData = null;
  var responseLength = 0;
  var error;

  //If we have an error trying to send data, blocks the callback frum running again
  //even if the receivedata receives data
  var wrappedCallback = function(err, d){
    callback(err, d);
    wrappedCallback = function(){};
  }

  if (opt.responseData && opt.responseData.length > 0) {
    responseData = opt.responseData;
  }
  if (responseData) {
    responseLength = responseData.length;
  }
  if (opt.responseLength) {
    responseLength = opt.responseLength;
  }
  var cmd = opt.cmd;
  if (cmd instanceof Array) {
    cmd = Buffer.from(cmd.concat(Statics.Sync_CRC_EOP));
  }

  receiveData(stream, timeout, responseLength, function (err, data) {
    if (err) {
      error = new Error('Sending ' + cmd.toString('hex') + ': ' + err.message);
      return wrappedCallback(error);
    }

    if (responseData && !data.equals(responseData)) {
      error = new Error(cmd + ' response mismatch: '+data.toString('hex')+', '+responseData.toString('hex'));
      return wrappedCallback(error);
    }
    wrappedCallback(null, data);
  });

  stream.write(cmd, function (err) {
    if (err) {
      error = new Error('Sending ' + cmd.toString('hex') + ': ' + err.message);
      return wrappedCallback(error);
    }
  });
};
