var bufferEqual = require('buffer-equal');
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
    cmd = new Buffer(cmd.concat(Statics.Sync_CRC_EOP));
  }
  console.log('write', cmd);
  stream.write(cmd, function (err) {
    if (err) {
      return callback(err);
    }
    receiveData(stream, timeout, responseLength, function (err, data) {
      if (err || !data || !responseData) {
        return callback(err, data);
      }
      if (!bufferEqual(data, responseData)) {
        console.log(data, data.toString('hex'));
        return callback(new Error('Response mismatch: '+data.toString('hex')+', '+responseData.toString('hex')), data)
      }
      callback(err, data);
    });
  });
}
