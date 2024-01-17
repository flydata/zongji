const Util = require('util');
const { EofPacket, ErrorPacket, ComBinlog, initBinlogPacketClass, ComBinlogGTID } = require('../packet');
const Sequence = require('@vlasky/mysql/lib/protocol/sequences').Sequence;

module.exports = function(zongji) {
  const BinlogPacket = initBinlogPacketClass(zongji);

  function Binlog(callback) {
    this.checkConnectionAliveTimer = setInterval(() => {
      if (this.lastPacketReceivedAt && Date.now() - this.lastPacketReceivedAt > 60000) {
        this.emit('error', new Error('Binlog connection dead. More than a minute since the last packet was received.'));
      }
    }, 60000);
    Sequence.call(this, callback);
  }

  Util.inherits(Binlog, Sequence);

  Binlog.prototype.start = function() {
    // options include: position / nonBlock / serverId / filename
    let options = zongji.get([
      'serverId', 'position', 'filename', 'nonBlock', 'gtidsData', 'enableGtid'
    ]);

    const ComBinlogClass = options.enableGtid? ComBinlogGTID : ComBinlog;

    this.emit('packet', new ComBinlogClass(options));
  };

  Binlog.prototype.determinePacket = function(firstByte) {
    this.lastPacketReceivedAt = Date.now();
    switch (firstByte) {
    case 0xfe:
      return EofPacket;
    case 0xff:
      return ErrorPacket;
    default:
      return BinlogPacket;
    }
  };

  Binlog.prototype['OkPacket'] = function() {
    console.log('Received one OkPacket ...');
  };

  Binlog.prototype['BinlogPacket'] = function(packet) {
    if (this._callback) {

      // Check event filtering
      if (zongji._skipEvent(packet.eventName.toLowerCase())) {
        return this._callback.call(this);
      }

      let event, error;
      try {
        event = packet.getEvent();
      } catch (err) {
        error = err;
      }
      this._callback.call(this, error, event);
    }
  };

  Binlog.prototype.end = function (err) {
    clearInterval(this.checkConnectionAliveTimer);
    Sequence.prototype.end.call(this, err);
  };

  return Binlog;
};
