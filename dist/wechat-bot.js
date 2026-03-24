#!/usr/bin/env bun
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/qrcode-terminal/vendor/QRCode/QRMode.js
var require_QRMode = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMode.js"(exports, module) {
    module.exports = {
      MODE_NUMBER: 1 << 0,
      MODE_ALPHA_NUM: 1 << 1,
      MODE_8BIT_BYTE: 1 << 2,
      MODE_KANJI: 1 << 3
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QR8bitByte.js
var require_QR8bitByte = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QR8bitByte.js"(exports, module) {
    var QRMode = require_QRMode();
    function QR8bitByte(data) {
      this.mode = QRMode.MODE_8BIT_BYTE;
      this.data = data;
    }
    QR8bitByte.prototype = {
      getLength: function() {
        return this.data.length;
      },
      write: function(buffer) {
        for (var i = 0; i < this.data.length; i++) {
          buffer.put(this.data.charCodeAt(i), 8);
        }
      }
    };
    module.exports = QR8bitByte;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMath.js
var require_QRMath = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMath.js"(exports, module) {
    var QRMath = {
      glog: function(n) {
        if (n < 1) {
          throw new Error("glog(" + n + ")");
        }
        return QRMath.LOG_TABLE[n];
      },
      gexp: function(n) {
        while (n < 0) {
          n += 255;
        }
        while (n >= 256) {
          n -= 255;
        }
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };
    for (i = 0; i < 8; i++) {
      QRMath.EXP_TABLE[i] = 1 << i;
    }
    var i;
    for (i = 8; i < 256; i++) {
      QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    }
    var i;
    for (i = 0; i < 255; i++) {
      QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
    }
    var i;
    module.exports = QRMath;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRPolynomial.js
var require_QRPolynomial = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRPolynomial.js"(exports, module) {
    var QRMath = require_QRMath();
    function QRPolynomial(num, shift) {
      if (num.length === void 0) {
        throw new Error(num.length + "/" + shift);
      }
      var offset = 0;
      while (offset < num.length && num[offset] === 0) {
        offset++;
      }
      this.num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i++) {
        this.num[i] = num[i + offset];
      }
    }
    QRPolynomial.prototype = {
      get: function(index) {
        return this.num[index];
      },
      getLength: function() {
        return this.num.length;
      },
      multiply: function(e) {
        var num = new Array(this.getLength() + e.getLength() - 1);
        for (var i = 0; i < this.getLength(); i++) {
          for (var j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new QRPolynomial(num, 0);
      },
      mod: function(e) {
        if (this.getLength() - e.getLength() < 0) {
          return this;
        }
        var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        var num = new Array(this.getLength());
        for (var i = 0; i < this.getLength(); i++) {
          num[i] = this.get(i);
        }
        for (var x = 0; x < e.getLength(); x++) {
          num[x] ^= QRMath.gexp(QRMath.glog(e.get(x)) + ratio);
        }
        return new QRPolynomial(num, 0).mod(e);
      }
    };
    module.exports = QRPolynomial;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRMaskPattern.js
var require_QRMaskPattern = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRMaskPattern.js"(exports, module) {
    module.exports = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRUtil.js
var require_QRUtil = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRUtil.js"(exports, module) {
    var QRMode = require_QRMode();
    var QRPolynomial = require_QRPolynomial();
    var QRMath = require_QRMath();
    var QRMaskPattern = require_QRMaskPattern();
    var QRUtil = {
      PATTERN_POSITION_TABLE: [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
      ],
      G15: 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0,
      G18: 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0,
      G15_MASK: 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1,
      getBCHTypeInfo: function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d ^= QRUtil.G15 << QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15);
        }
        return (data << 10 | d) ^ QRUtil.G15_MASK;
      },
      getBCHTypeNumber: function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
          d ^= QRUtil.G18 << QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18);
        }
        return data << 12 | d;
      },
      getBCHDigit: function(data) {
        var digit = 0;
        while (data !== 0) {
          digit++;
          data >>>= 1;
        }
        return digit;
      },
      getPatternPosition: function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
      },
      getMask: function(maskPattern, i, j) {
        switch (maskPattern) {
          case QRMaskPattern.PATTERN000:
            return (i + j) % 2 === 0;
          case QRMaskPattern.PATTERN001:
            return i % 2 === 0;
          case QRMaskPattern.PATTERN010:
            return j % 3 === 0;
          case QRMaskPattern.PATTERN011:
            return (i + j) % 3 === 0;
          case QRMaskPattern.PATTERN100:
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case QRMaskPattern.PATTERN101:
            return i * j % 2 + i * j % 3 === 0;
          case QRMaskPattern.PATTERN110:
            return (i * j % 2 + i * j % 3) % 2 === 0;
          case QRMaskPattern.PATTERN111:
            return (i * j % 3 + (i + j) % 2) % 2 === 0;
          default:
            throw new Error("bad maskPattern:" + maskPattern);
        }
      },
      getErrorCorrectPolynomial: function(errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
          a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
      },
      getLengthInBits: function(mode, type) {
        if (1 <= type && type < 10) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 10;
            case QRMode.MODE_ALPHA_NUM:
              return 9;
            case QRMode.MODE_8BIT_BYTE:
              return 8;
            case QRMode.MODE_KANJI:
              return 8;
            default:
              throw new Error("mode:" + mode);
          }
        } else if (type < 27) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 12;
            case QRMode.MODE_ALPHA_NUM:
              return 11;
            case QRMode.MODE_8BIT_BYTE:
              return 16;
            case QRMode.MODE_KANJI:
              return 10;
            default:
              throw new Error("mode:" + mode);
          }
        } else if (type < 41) {
          switch (mode) {
            case QRMode.MODE_NUMBER:
              return 14;
            case QRMode.MODE_ALPHA_NUM:
              return 13;
            case QRMode.MODE_8BIT_BYTE:
              return 16;
            case QRMode.MODE_KANJI:
              return 12;
            default:
              throw new Error("mode:" + mode);
          }
        } else {
          throw new Error("type:" + type);
        }
      },
      getLostPoint: function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0;
        var col = 0;
        for (row = 0; row < moduleCount; row++) {
          for (col = 0; col < moduleCount; col++) {
            var sameCount = 0;
            var dark = qrCode.isDark(row, col);
            for (var r = -1; r <= 1; r++) {
              if (row + r < 0 || moduleCount <= row + r) {
                continue;
              }
              for (var c = -1; c <= 1; c++) {
                if (col + c < 0 || moduleCount <= col + c) {
                  continue;
                }
                if (r === 0 && c === 0) {
                  continue;
                }
                if (dark === qrCode.isDark(row + r, col + c)) {
                  sameCount++;
                }
              }
            }
            if (sameCount > 5) {
              lostPoint += 3 + sameCount - 5;
            }
          }
        }
        for (row = 0; row < moduleCount - 1; row++) {
          for (col = 0; col < moduleCount - 1; col++) {
            var count = 0;
            if (qrCode.isDark(row, col)) count++;
            if (qrCode.isDark(row + 1, col)) count++;
            if (qrCode.isDark(row, col + 1)) count++;
            if (qrCode.isDark(row + 1, col + 1)) count++;
            if (count === 0 || count === 4) {
              lostPoint += 3;
            }
          }
        }
        for (row = 0; row < moduleCount; row++) {
          for (col = 0; col < moduleCount - 6; col++) {
            if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6)) {
              lostPoint += 40;
            }
          }
        }
        for (col = 0; col < moduleCount; col++) {
          for (row = 0; row < moduleCount - 6; row++) {
            if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col)) {
              lostPoint += 40;
            }
          }
        }
        var darkCount = 0;
        for (col = 0; col < moduleCount; col++) {
          for (row = 0; row < moduleCount; row++) {
            if (qrCode.isDark(row, col)) {
              darkCount++;
            }
          }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;
      }
    };
    module.exports = QRUtil;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js
var require_QRErrorCorrectLevel = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js"(exports, module) {
    module.exports = {
      L: 1,
      M: 0,
      Q: 3,
      H: 2
    };
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRRSBlock.js
var require_QRRSBlock = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRRSBlock.js"(exports, module) {
    var QRErrorCorrectLevel = require_QRErrorCorrectLevel();
    function QRRSBlock(totalCount, dataCount) {
      this.totalCount = totalCount;
      this.dataCount = dataCount;
    }
    QRRSBlock.RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4		
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7		
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10		
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
      var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
      if (rsBlock === void 0) {
        throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
      }
      var length = rsBlock.length / 3;
      var list = [];
      for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) {
          list.push(new QRRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
      switch (errorCorrectLevel) {
        case QRErrorCorrectLevel.L:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectLevel.M:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectLevel.Q:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectLevel.H:
          return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    module.exports = QRRSBlock;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/QRBitBuffer.js
var require_QRBitBuffer = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/QRBitBuffer.js"(exports, module) {
    function QRBitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    QRBitBuffer.prototype = {
      get: function(index) {
        var bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
      },
      put: function(num, length) {
        for (var i = 0; i < length; i++) {
          this.putBit((num >>> length - i - 1 & 1) == 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        var bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module.exports = QRBitBuffer;
  }
});

// node_modules/qrcode-terminal/vendor/QRCode/index.js
var require_QRCode = __commonJS({
  "node_modules/qrcode-terminal/vendor/QRCode/index.js"(exports, module) {
    var QR8bitByte = require_QR8bitByte();
    var QRUtil = require_QRUtil();
    var QRPolynomial = require_QRPolynomial();
    var QRRSBlock = require_QRRSBlock();
    var QRBitBuffer = require_QRBitBuffer();
    function QRCode(typeNumber, errorCorrectLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectLevel = errorCorrectLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }
    QRCode.prototype = {
      addData: function(data) {
        var newData = new QR8bitByte(data);
        this.dataList.push(newData);
        this.dataCache = null;
      },
      isDark: function(row, col) {
        if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
          throw new Error(row + "," + col);
        }
        return this.modules[row][col];
      },
      getModuleCount: function() {
        return this.moduleCount;
      },
      make: function() {
        if (this.typeNumber < 1) {
          var typeNumber = 1;
          for (typeNumber = 1; typeNumber < 40; typeNumber++) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
            var buffer = new QRBitBuffer();
            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) {
              totalDataCount += rsBlocks[i].dataCount;
            }
            for (var x = 0; x < this.dataList.length; x++) {
              var data = this.dataList[x];
              buffer.put(data.mode, 4);
              buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
              data.write(buffer);
            }
            if (buffer.getLengthInBits() <= totalDataCount * 8)
              break;
          }
          this.typeNumber = typeNumber;
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl: function(test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (var row = 0; row < this.moduleCount; row++) {
          this.modules[row] = new Array(this.moduleCount);
          for (var col = 0; col < this.moduleCount; col++) {
            this.modules[row][col] = null;
          }
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) {
          this.setupTypeNumber(test);
        }
        if (this.dataCache === null) {
          this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
        }
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function(row, col) {
        for (var r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (var c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if (0 <= r && r <= 6 && (c === 0 || c === 6) || 0 <= c && c <= 6 && (r === 0 || r === 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern: function() {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          var lostPoint = QRUtil.getLostPoint(this);
          if (i === 0 || minLostPoint > lostPoint) {
            minLostPoint = lostPoint;
            pattern = i;
          }
        }
        return pattern;
      },
      createMovieClip: function(target_mc, instance_name, depth) {
        var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
        var cs = 1;
        this.make();
        for (var row = 0; row < this.modules.length; row++) {
          var y = row * cs;
          for (var col = 0; col < this.modules[row].length; col++) {
            var x = col * cs;
            var dark = this.modules[row][col];
            if (dark) {
              qr_mc.beginFill(0, 100);
              qr_mc.moveTo(x, y);
              qr_mc.lineTo(x + cs, y);
              qr_mc.lineTo(x + cs, y + cs);
              qr_mc.lineTo(x, y + cs);
              qr_mc.endFill();
            }
          }
        }
        return qr_mc;
      },
      setupTimingPattern: function() {
        for (var r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] !== null) {
            continue;
          }
          this.modules[r][6] = r % 2 === 0;
        }
        for (var c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] !== null) {
            continue;
          }
          this.modules[6][c] = c % 2 === 0;
        }
      },
      setupPositionAdjustPattern: function() {
        var pos = QRUtil.getPatternPosition(this.typeNumber);
        for (var i = 0; i < pos.length; i++) {
          for (var j = 0; j < pos.length; j++) {
            var row = pos[i];
            var col = pos[j];
            if (this.modules[row][col] !== null) {
              continue;
            }
            for (var r = -2; r <= 2; r++) {
              for (var c = -2; c <= 2; c++) {
                if (Math.abs(r) === 2 || Math.abs(c) === 2 || r === 0 && c === 0) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeNumber: function(test) {
        var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
        for (var i = 0; i < 18; i++) {
          mod = !test && (bits >> i & 1) === 1;
          this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
        }
        for (var x = 0; x < 18; x++) {
          mod = !test && (bits >> x & 1) === 1;
          this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
        }
      },
      setupTypeInfo: function(test, maskPattern) {
        var data = this.errorCorrectLevel << 3 | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
        for (var v = 0; v < 15; v++) {
          mod = !test && (bits >> v & 1) === 1;
          if (v < 6) {
            this.modules[v][8] = mod;
          } else if (v < 8) {
            this.modules[v + 1][8] = mod;
          } else {
            this.modules[this.moduleCount - 15 + v][8] = mod;
          }
        }
        for (var h = 0; h < 15; h++) {
          mod = !test && (bits >> h & 1) === 1;
          if (h < 8) {
            this.modules[8][this.moduleCount - h - 1] = mod;
          } else if (h < 9) {
            this.modules[8][15 - h - 1 + 1] = mod;
          } else {
            this.modules[8][15 - h - 1] = mod;
          }
        }
        this.modules[this.moduleCount - 8][8] = !test;
      },
      mapData: function(data, maskPattern) {
        var inc = -1;
        var row = this.moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col === 6) col--;
          while (true) {
            for (var c = 0; c < 2; c++) {
              if (this.modules[row][col - c] === null) {
                var dark = false;
                if (byteIndex < data.length) {
                  dark = (data[byteIndex] >>> bitIndex & 1) === 1;
                }
                var mask = QRUtil.getMask(maskPattern, row, col - c);
                if (mask) {
                  dark = !dark;
                }
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex === -1) {
                  byteIndex++;
                  bitIndex = 7;
                }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      }
    };
    QRCode.PAD0 = 236;
    QRCode.PAD1 = 17;
    QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
      var buffer = new QRBitBuffer();
      for (var i = 0; i < dataList.length; i++) {
        var data = dataList[i];
        buffer.put(data.mode, 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
        data.write(buffer);
      }
      var totalDataCount = 0;
      for (var x = 0; x < rsBlocks.length; x++) {
        totalDataCount += rsBlocks[x].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(QRCode.PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(QRCode.PAD1, 8);
      }
      return QRCode.createBytes(buffer, rsBlocks);
    };
    QRCode.createBytes = function(buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r++) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i++) {
          dcdata[r][i] = 255 & buffer.buffer[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var x = 0; x < ecdata[r].length; x++) {
          var modIndex = x + modPoly.getLength() - ecdata[r].length;
          ecdata[r][x] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
        }
      }
      var totalCodeCount = 0;
      for (var y = 0; y < rsBlocks.length; y++) {
        totalCodeCount += rsBlocks[y].totalCount;
      }
      var data = new Array(totalCodeCount);
      var index = 0;
      for (var z = 0; z < maxDcCount; z++) {
        for (var s = 0; s < rsBlocks.length; s++) {
          if (z < dcdata[s].length) {
            data[index++] = dcdata[s][z];
          }
        }
      }
      for (var xx = 0; xx < maxEcCount; xx++) {
        for (var t = 0; t < rsBlocks.length; t++) {
          if (xx < ecdata[t].length) {
            data[index++] = ecdata[t][xx];
          }
        }
      }
      return data;
    };
    module.exports = QRCode;
  }
});

// node_modules/qrcode-terminal/lib/main.js
var require_main = __commonJS({
  "node_modules/qrcode-terminal/lib/main.js"(exports, module) {
    var QRCode = require_QRCode();
    var QRErrorCorrectLevel = require_QRErrorCorrectLevel();
    var black = "\x1B[40m  \x1B[0m";
    var white = "\x1B[47m  \x1B[0m";
    var toCell = function(isBlack) {
      return isBlack ? black : white;
    };
    var repeat = function(color) {
      return {
        times: function(count) {
          return new Array(count).join(color);
        }
      };
    };
    var fill = function(length, value) {
      var arr = new Array(length);
      for (var i = 0; i < length; i++) {
        arr[i] = value;
      }
      return arr;
    };
    module.exports = {
      error: QRErrorCorrectLevel.L,
      generate: function(input, opts, cb) {
        if (typeof opts === "function") {
          cb = opts;
          opts = {};
        }
        var qrcode = new QRCode(-1, this.error);
        qrcode.addData(input);
        qrcode.make();
        var output = "";
        if (opts && opts.small) {
          var BLACK = true, WHITE = false;
          var moduleCount = qrcode.getModuleCount();
          var moduleData = qrcode.modules.slice();
          var oddRow = moduleCount % 2 === 1;
          if (oddRow) {
            moduleData.push(fill(moduleCount, WHITE));
          }
          var platte = {
            WHITE_ALL: "\u2588",
            WHITE_BLACK: "\u2580",
            BLACK_WHITE: "\u2584",
            BLACK_ALL: " "
          };
          var borderTop = repeat(platte.BLACK_WHITE).times(moduleCount + 3);
          var borderBottom = repeat(platte.WHITE_BLACK).times(moduleCount + 3);
          output += borderTop + "\n";
          for (var row = 0; row < moduleCount; row += 2) {
            output += platte.WHITE_ALL;
            for (var col = 0; col < moduleCount; col++) {
              if (moduleData[row][col] === WHITE && moduleData[row + 1][col] === WHITE) {
                output += platte.WHITE_ALL;
              } else if (moduleData[row][col] === WHITE && moduleData[row + 1][col] === BLACK) {
                output += platte.WHITE_BLACK;
              } else if (moduleData[row][col] === BLACK && moduleData[row + 1][col] === WHITE) {
                output += platte.BLACK_WHITE;
              } else {
                output += platte.BLACK_ALL;
              }
            }
            output += platte.WHITE_ALL + "\n";
          }
          if (!oddRow) {
            output += borderBottom;
          }
        } else {
          var border = repeat(white).times(qrcode.getModuleCount() + 3);
          output += border + "\n";
          qrcode.modules.forEach(function(row2) {
            output += white;
            output += row2.map(toCell).join("");
            output += white + "\n";
          });
          output += border;
        }
        if (cb) cb(output);
        else console.log(output);
      },
      setErrorLevel: function(error) {
        this.error = QRErrorCorrectLevel[error] || this.error;
      }
    };
  }
});

// wechat-bot.ts
import crypto3 from "node:crypto";
import fs3 from "node:fs";
import path2 from "node:path";
import process2 from "node:process";
import { spawn, execSync } from "node:child_process";

// shared.ts
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
var BOT_TYPE = "3";
var LONG_POLL_TIMEOUT_MS = 35e3;
var CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
var MSG_ITEM_TEXT = 1;
var MSG_ITEM_IMAGE = 2;
var MSG_ITEM_VOICE = 3;
var MSG_ITEM_FILE = 4;
var MSG_ITEM_VIDEO = 5;
var CHANNEL_VERSION = "1.0.3";
function buildBaseInfo() {
  return { channel_version: CHANNEL_VERSION };
}
function getHomeDir() {
  return os.homedir();
}
function getCredentialsDir() {
  return path.join(getHomeDir(), ".claude", "channels", "wechat");
}
function getCredentialsFile() {
  return path.join(getCredentialsDir(), "account.json");
}
function getSyncBufFile() {
  return path.join(getCredentialsDir(), "sync_buf.txt");
}
function getContextTokensFile() {
  return path.join(getCredentialsDir(), "context_tokens.json");
}
function getLockPidFile() {
  return path.join(getCredentialsDir(), "lock.pid");
}
function getSessionsFile() {
  return path.join(getCredentialsDir(), "sessions.json");
}
function loadCredentials() {
  try {
    const file = getCredentialsFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}
function saveCredentials(data) {
  const dir = getCredentialsDir();
  const file = getCredentialsFile();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.chmodSync(file, 384);
  } catch {
  }
}
function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}
function buildHeaders(token, body) {
  const headers = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin()
  };
  if (body) {
    headers["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}
async function apiFetch(params) {
  const base = params.baseUrl.endsWith("/") ? params.baseUrl : `${params.baseUrl}/`;
  const url = new URL(params.endpoint, base).toString();
  const headers = buildHeaders(params.token, params.body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: params.body,
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      process.stderr.write(`[shared] API error: HTTP ${res.status} \u2014 ${text.slice(0, 500)}
`);
      throw new Error(`HTTP ${res.status}`);
    }
    return text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
async function fetchQRCode(baseUrl) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`,
    base
  );
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
  return await res.json();
}
async function pollQRStatus(baseUrl, qrcode) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    base
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35e3);
  try {
    const res = await fetch(url.toString(), {
      headers: { "iLink-App-ClientVersion": "1" },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`QR status failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "wait" };
    }
    throw err;
  }
}

// typing.ts
var TYPING_TTL_MS = 24 * 60 * 60 * 1e3;
var TYPING_BACKOFF_BASE_MS = 5e3;
var TYPING_MAX_BACKOFF_MS = 3e4;
var TypingManager = class {
  tickets = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  failCounts = /* @__PURE__ */ new Map();
  config = { botId: "", token: "", baseUrl: "" };
  configure(botId, token, baseUrl) {
    this.config = { botId, token, baseUrl };
  }
  getTicket(senderId) {
    const entry = this.tickets.get(senderId);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.tickets.delete(senderId);
      return void 0;
    }
    return entry.ticket;
  }
  setTicket(senderId, ticket) {
    this.tickets.set(senderId, { ticket, expiresAt: Date.now() + TYPING_TTL_MS });
  }
  getBackoffMs(senderId) {
    const count = this.failCounts.get(senderId) ?? 0;
    return Math.min(TYPING_BACKOFF_BASE_MS * Math.pow(2, count), TYPING_MAX_BACKOFF_MS);
  }
  async fetchConfig(senderId) {
    try {
      const raw = await apiFetch({
        baseUrl: this.config.baseUrl,
        endpoint: "ilink/bot/getconfig",
        body: JSON.stringify({
          base_info: buildBaseInfo(),
          bot_id: this.config.botId,
          user_id: senderId
        }),
        token: this.config.token,
        timeoutMs: 1e4
      });
      const resp = JSON.parse(raw);
      if (resp.typing_ticket) {
        this.setTicket(senderId, resp.typing_ticket);
        this.failCounts.set(senderId, 0);
        return resp.typing_ticket;
      }
    } catch {
    }
    return null;
  }
  async sendTyping(senderId, status) {
    if (!this.config.token) return;
    if (status === 2) {
      const timer = this.timers.get(senderId);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(senderId);
      }
    }
    let ticket = this.getTicket(senderId);
    if (!ticket) {
      ticket = await this.fetchConfig(senderId);
      if (!ticket) return;
    }
    try {
      await apiFetch({
        baseUrl: this.config.baseUrl,
        endpoint: "ilink/bot/sendtyping",
        body: JSON.stringify({
          base_info: buildBaseInfo(),
          typing_ticket: ticket,
          status
        }),
        token: this.config.token,
        timeoutMs: 5e3
      });
      this.failCounts.set(senderId, 0);
    } catch {
      const count = (this.failCounts.get(senderId) ?? 0) + 1;
      this.failCounts.set(senderId, count);
      if (count >= 3) {
        this.tickets.delete(senderId);
        this.failCounts.delete(senderId);
      }
    }
  }
  startKeepalive(senderId) {
    const existing = this.timers.get(senderId);
    if (existing) clearInterval(existing);
    const intervalMs = this.getBackoffMs(senderId);
    const timer = setInterval(() => {
      this.sendTyping(senderId, 1);
    }, intervalMs);
    this.timers.set(senderId, timer);
  }
  stopKeepalive(senderId) {
    const timer = this.timers.get(senderId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(senderId);
    }
  }
  stopAll() {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
};

// media.ts
import crypto2 from "node:crypto";
function pkcs7Unpad(buf) {
  const padLen = buf[buf.length - 1];
  if (padLen === 0 || padLen > 16) return buf;
  for (let i = buf.length - padLen; i < buf.length; i++) {
    if (buf[i] !== padLen) return buf;
  }
  return buf.subarray(0, buf.length - padLen);
}
function parseAesKey(aesKeyBase64) {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) return decoded;
  const hexStr = decoded.toString("utf-8").trim();
  if (/^[0-9a-fA-F]{32}$/.test(hexStr)) {
    return Buffer.from(hexStr, "hex");
  }
  return decoded.subarray(0, 16);
}
function decryptAesEcb(ciphertext, key) {
  const decipher = crypto2.createDecipheriv("aes-128-ecb", key, null);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return pkcs7Unpad(decrypted);
}
async function downloadAndDecryptBuffer(media) {
  if (!media.encrypt_query_param || !media.aes_key) return null;
  try {
    const url = `${CDN_BASE_URL}?${media.encrypt_query_param}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_DOWNLOAD_SIZE) return null;
    const arrayBuf = await res.arrayBuffer();
    const encrypted = Buffer.from(arrayBuf);
    if (encrypted.length > MAX_DOWNLOAD_SIZE) return null;
    const key = parseAesKey(media.aes_key);
    return decryptAesEcb(encrypted, key);
  } catch {
    return null;
  }
}
var MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024;

// session-manager.ts
import fs2 from "node:fs";
var IDLE_TIMEOUT_MS = 30 * 60 * 1e3;
var SDK_REPLY_TIMEOUT_MS = 12e4;
var DEFAULT_MODEL = "claude-sonnet-4-6";
function log(msg) {
  process.stderr.write(`[session-manager] ${msg}
`);
}
function logError(msg) {
  process.stderr.write(`[session-manager] ERROR: ${msg}
`);
}
var SessionManager = class {
  sessions = /* @__PURE__ */ new Map();
  records = /* @__PURE__ */ new Map();
  idleTimer = null;
  saveTimer = null;
  recordsDirty = false;
  sdkAvailable = false;
  sdkModule = null;
  deps;
  model;
  maxTurns;
  constructor(deps, options) {
    this.deps = deps;
    this.model = options?.model || process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    this.maxTurns = options?.maxTurns ?? parseInt(process.env.CLAUDE_MAX_TURNS || "5", 10);
    this.loadRecords();
  }
  // ── SDK probe ───────────────────────────────────────────────────────────
  async probeSdk() {
    if (process.env.CLAUDE_SDK_MODE === "spawn") {
      log("CLAUDE_SDK_MODE=spawn\uFF0C\u5F3A\u5236\u4F7F\u7528 spawn \u6A21\u5F0F");
      return false;
    }
    try {
      this.sdkModule = await import("@anthropic-ai/claude-agent-sdk");
      if (typeof this.sdkModule.unstable_v2_createSession === "function") {
        this.sdkAvailable = true;
        this.startIdleTimer();
        log(`\u4F7F\u7528 Claude Agent SDK V2 \u6A21\u5F0F (model=${this.model}, maxTurns=${this.maxTurns})`);
        return true;
      }
      log("SDK \u4E0D\u5305\u542B V2 API\uFF0C\u56DE\u9000\u5230 spawn \u6A21\u5F0F");
      return false;
    } catch (err) {
      log(`SDK \u672A\u5B89\u88C5\u6216\u52A0\u8F7D\u5931\u8D25\uFF0C\u56DE\u9000\u5230 spawn \u6A21\u5F0F: ${String(err)}`);
      return false;
    }
  }
  get isSdkMode() {
    return this.sdkAvailable;
  }
  // ── Core: send message and get reply ────────────────────────────────────
  async sendMessage(senderId, content) {
    if (!this.sdkAvailable) {
      throw new Error("SDK not available");
    }
    let entry;
    try {
      entry = await this.getOrCreateSession(senderId);
    } catch (err) {
      logError(`\u521B\u5EFA/\u6062\u590D session \u5931\u8D25: ${String(err)}`);
      return "\u62B1\u6B49\uFF0C\u5904\u7406\u6D88\u606F\u65F6\u51FA\u73B0\u4E86\u95EE\u9898\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002";
    }
    const senderName = senderId.split("@")[0] || senderId;
    const prompt = `[\u5FAE\u4FE1\u6D88\u606F] \u6765\u81EA: ${senderName}
${content}

\u8BF7\u7528\u4E2D\u6587\u56DE\u590D\uFF0C\u4E0D\u8981\u4F7F\u7528 Markdown \u683C\u5F0F\u3002`;
    try {
      await entry.session.send(prompt);
    } catch (err) {
      logError(`session.send \u5931\u8D25: ${String(err)}`);
      this.destroySession(senderId);
      return "\u62B1\u6B49\uFF0C\u53D1\u9001\u6D88\u606F\u5230 Claude \u5931\u8D25\u4E86\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002";
    }
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), SDK_REPLY_TIMEOUT_MS);
    });
    try {
      const reply = await Promise.race([
        this.collectReply(entry.session, senderId),
        timeoutPromise
      ]);
      clearTimeout(timer);
      entry.lastUsedAt = Date.now();
      this.updateRecord(senderId, entry.sessionId);
      log(`SDK \u56DE\u590D (${senderId}): ${reply.slice(0, 80)}...`);
      return reply;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.message === "timeout") {
        logError(`SDK \u56DE\u590D\u8D85\u65F6 (${SDK_REPLY_TIMEOUT_MS / 1e3}s)`);
      } else {
        logError(`stream \u5F02\u5E38: ${String(err)}`);
      }
      this.destroySession(senderId);
      return "\u62B1\u6B49\uFF0C\u5904\u7406\u6D88\u606F\u65F6\u51FA\u73B0\u4E86\u95EE\u9898\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002";
    }
  }
  // ── Stream collection ──────────────────────────────────────────────────
  async collectReply(session, senderId) {
    const textParts = [];
    for await (const msg of session.stream()) {
      if (msg.session_id) {
        const entry = this.sessions.get(senderId);
        if (entry && entry.sessionId !== msg.session_id) {
          entry.sessionId = msg.session_id;
          this.updateRecord(senderId, msg.session_id);
        }
      }
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
          }
        }
      }
      if (msg.type === "control_request") {
        log(`control_request \u4E8B\u4EF6 (senderId=${senderId})`);
      }
    }
    return textParts.join("") || "\uFF08\u65E0\u56DE\u590D\u5185\u5BB9\uFF09";
  }
  // ── Session lifecycle ───────────────────────────────────────────────────
  async getOrCreateSession(senderId) {
    const active = this.sessions.get(senderId);
    if (active) {
      active.lastUsedAt = Date.now();
      return active;
    }
    const record = this.records.get(senderId);
    if (record?.sessionId) {
      try {
        const entry = this.resumeSession(senderId, record.sessionId);
        return entry;
      } catch (err) {
        log(`\u6062\u590D session \u5931\u8D25: ${String(err)}\uFF0C\u521B\u5EFA\u65B0 session`);
        this.records.delete(senderId);
        this.markRecordsDirty();
      }
    }
    return this.createSession(senderId);
  }
  createSession(senderId) {
    const sessionOpts = {
      model: this.model,
      maxTurns: this.maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: this.buildEnv()
    };
    const session = this.sdkModule.unstable_v2_createSession(sessionOpts);
    const entry = {
      session,
      sessionId: session.sessionId,
      lastUsedAt: Date.now()
    };
    this.sessions.set(senderId, entry);
    this.updateRecord(senderId, session.sessionId);
    log(`\u521B\u5EFA\u65B0 SDK session: ${senderId} \u2192 ${session.sessionId.slice(0, 8)}...`);
    return entry;
  }
  resumeSession(senderId, sessionId) {
    const sessionOpts = {
      model: this.model,
      maxTurns: this.maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: this.buildEnv()
    };
    const session = this.sdkModule.unstable_v2_resumeSession(
      sessionId,
      sessionOpts
    );
    const entry = {
      session,
      sessionId,
      lastUsedAt: Date.now()
    };
    this.sessions.set(senderId, entry);
    this.updateRecord(senderId, sessionId);
    log(`\u6062\u590D session (\u5DF2\u4FDD\u7559\u4E0A\u4E0B\u6587): ${senderId} \u2192 ${sessionId.slice(0, 8)}...`);
    return entry;
  }
  destroySession(senderId) {
    const entry = this.sessions.get(senderId);
    if (entry) {
      try {
        entry.session.close();
      } catch {
      }
      this.sessions.delete(senderId);
    }
  }
  async clearSession(senderId) {
    this.destroySession(senderId);
    this.records.delete(senderId);
    this.markRecordsDirty();
  }
  async closeAll() {
    for (const [senderId] of this.sessions) {
      this.destroySession(senderId);
    }
    this.sessions.clear();
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.flushRecords();
  }
  // ── Idle timeout ───────────────────────────────────────────────────────
  startIdleTimer() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      for (const [senderId, entry] of this.sessions) {
        if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
          try {
            entry.session.close();
          } catch {
          }
          this.sessions.delete(senderId);
          log(`session \u7A7A\u95F2\u5173\u95ED\uFF0C\u4E0A\u4E0B\u6587\u5DF2\u4FDD\u7559: ${senderId}`);
        }
      }
    }, 6e4);
  }
  // ── Env construction ───────────────────────────────────────────────────
  buildEnv() {
    const env = {};
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
    }
    return env;
  }
  // ── Persistence (debounced writes) ─────────────────────────────────────
  loadRecords() {
    try {
      const file = getSessionsFile();
      if (!fs2.existsSync(file)) return;
      const data = JSON.parse(fs2.readFileSync(file, "utf-8"));
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") {
          log(`\u8FC1\u79FB\u65E7\u683C\u5F0F session \u8BB0\u5F55: ${key}`);
          continue;
        }
        const record = value;
        if (record.sessionId) {
          this.records.set(key, record);
        }
      }
      log(`\u52A0\u8F7D session \u8BB0\u5F55: ${this.records.size} \u6761`);
    } catch (err) {
      logError(`\u52A0\u8F7D session \u8BB0\u5F55\u5931\u8D25: ${String(err)}`);
    }
  }
  markRecordsDirty() {
    if (this.recordsDirty) return;
    this.recordsDirty = true;
    this.saveTimer = setTimeout(() => {
      this.flushRecords();
    }, 2e3);
  }
  flushRecords() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.recordsDirty) return;
    this.recordsDirty = false;
    this.saveRecordsNow();
  }
  saveRecordsNow() {
    try {
      const dir = getCredentialsDir();
      const file = getSessionsFile();
      fs2.mkdirSync(dir, { recursive: true });
      const data = {};
      for (const [key, record] of this.records) {
        data[key] = record;
      }
      fs2.writeFileSync(file, JSON.stringify(data), "utf-8");
      try {
        fs2.chmodSync(file, 384);
      } catch {
      }
    } catch {
    }
  }
  updateRecord(senderId, sessionId) {
    const existing = this.records.get(senderId);
    this.records.set(senderId, {
      sessionId,
      createdAt: existing?.createdAt || Date.now(),
      lastUsedAt: Date.now()
    });
    this.markRecordsDirty();
  }
};

// wechat-bot.ts
var MAX_CONSECUTIVE_FAILURES = 3;
var MAX_REPLY_LENGTH = 4096;
var SEND_RETRY_COUNT = 2;
var SEND_RETRY_DELAY_MS = 1e3;
var CONTEXT_TOKEN_MAX_ENTRIES = 500;
var CONTEXT_TOKEN_TTL_MS = 24 * 60 * 60 * 1e3;
var LONG_POLL_TIMEOUT_MIN_MS = 1e4;
var LONG_POLL_TIMEOUT_MAX_MS = 6e4;
var CLAUDE_TIMEOUT_MS = 12e4;
function log2(msg) {
  process2.stderr.write(`[wechat-bot] ${msg}
`);
}
function logError2(msg) {
  process2.stderr.write(`[wechat-bot] ERROR: ${msg}
`);
}
var MSG_TYPE_USER = 1;
var MSG_TYPE_BOT = 2;
var MSG_STATE_FINISH = 2;
var contextTokenCache = /* @__PURE__ */ new Map();
function loadContextTokens() {
  try {
    const file = getContextTokensFile();
    if (!fs3.existsSync(file)) return;
    const data = JSON.parse(fs3.readFileSync(file, "utf-8"));
    const now = Date.now();
    for (const [key, entry] of Object.entries(data)) {
      if (now - entry.ts < CONTEXT_TOKEN_TTL_MS) {
        contextTokenCache.set(key, { token: entry.token, lastAccessed: entry.ts });
      }
    }
    log2(`\u52A0\u8F7D context_token \u7F13\u5B58: ${contextTokenCache.size} \u6761`);
  } catch {
  }
}
function saveContextTokens() {
  try {
    const dir = getCredentialsDir();
    const file = getContextTokensFile();
    fs3.mkdirSync(dir, { recursive: true });
    const data = {};
    for (const [key, entry] of contextTokenCache.entries()) {
      data[key] = { token: entry.token, ts: entry.lastAccessed };
    }
    fs3.writeFileSync(file, JSON.stringify(data), "utf-8");
    try {
      fs3.chmodSync(file, 384);
    } catch {
    }
  } catch {
  }
}
function evictContextTokens() {
  const now = Date.now();
  for (const [key, entry] of contextTokenCache.entries()) {
    if (now - entry.lastAccessed > CONTEXT_TOKEN_TTL_MS) {
      contextTokenCache.delete(key);
    }
  }
  if (contextTokenCache.size > CONTEXT_TOKEN_MAX_ENTRIES) {
    const entries = [...contextTokenCache.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );
    const toRemove = entries.length - CONTEXT_TOKEN_MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      contextTokenCache.delete(entries[i][0]);
    }
  }
}
function cacheContextToken(userId, token) {
  contextTokenCache.set(userId, { token, lastAccessed: Date.now() });
  evictContextTokens();
  saveContextTokens();
}
function getCachedContextToken(userId) {
  const entry = contextTokenCache.get(userId);
  if (!entry) return void 0;
  if (Date.now() - entry.lastAccessed > CONTEXT_TOKEN_TTL_MS) {
    contextTokenCache.delete(userId);
    return void 0;
  }
  entry.lastAccessed = Date.now();
  return entry.token;
}
var SESSIONS_FILE = path2.join(getCredentialsDir(), "sessions.json");
function loadSessions() {
  try {
    if (!fs3.existsSync(SESSIONS_FILE)) return {};
    return JSON.parse(fs3.readFileSync(SESSIONS_FILE, "utf-8"));
  } catch {
    return {};
  }
}
function saveSessions(sessions) {
  try {
    const dir = getCredentialsDir();
    fs3.mkdirSync(dir, { recursive: true });
    fs3.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions), "utf-8");
    try {
      fs3.chmodSync(SESSIONS_FILE, 384);
    } catch {
    }
  } catch {
  }
}
function clearSession(sessions, senderId) {
  delete sessions[senderId];
  saveSessions(sessions);
}
var LOCK_STALE_TIMEOUT_MS = 10 * 60 * 1e3;
function getLockFileAge(lockFile) {
  try {
    const stat = fs3.statSync(lockFile);
    return Date.now() - stat.mtimeMs;
  } catch {
    return Infinity;
  }
}
function isLikelyWechatBot(pid) {
  try {
    const isWin = process2.platform === "win32";
    const cmd = isWin ? `wmic process where "ProcessId=${pid}" get CommandLine /FORMAT:LIST 2>NUL` : `cat /proc/${pid}/cmdline 2>/dev/null || ps -p ${pid} -o command= 2>/dev/null`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 3e3 });
    return output.toLowerCase().includes("wechat-bot") || output.toLowerCase().includes("wechat-channel");
  } catch {
    return true;
  }
}
function acquireLock() {
  const lockFile = getLockPidFile();
  try {
    fs3.mkdirSync(getCredentialsDir(), { recursive: true });
    try {
      const fd = fs3.openSync(lockFile, "wx");
      fs3.writeSync(fd, String(process2.pid));
      fs3.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const existingPid = parseInt(fs3.readFileSync(lockFile, "utf-8").trim(), 10);
          if (!isNaN(existingPid)) {
            process2.kill(existingPid, 0);
            const age = getLockFileAge(lockFile);
            if (age > LOCK_STALE_TIMEOUT_MS) {
              log2(`\u9501\u6587\u4EF6\u5DF2\u8FC7\u671F (${Math.round(age / 6e4)} \u5206\u949F\u524D\u521B\u5EFA)\uFF0C\u5C1D\u8BD5\u6E05\u7406...`);
            } else if (isLikelyWechatBot(existingPid)) {
              logError2(`\u53E6\u4E00\u4E2A\u5B9E\u4F8B\u5DF2\u5728\u8FD0\u884C (PID ${existingPid})\uFF0C\u9000\u51FA\u3002`);
              return false;
            } else {
              log2(`PID ${existingPid} \u5B58\u6D3B\u4F46\u4E0D\u662F wechat \u8FDB\u7A0B (\u53EF\u80FD PID \u590D\u7528)\uFF0C\u6E05\u7406\u9501\u6587\u4EF6...`);
            }
          }
        } catch {
        }
        try {
          fs3.unlinkSync(lockFile);
          const fd = fs3.openSync(lockFile, "wx");
          fs3.writeSync(fd, String(process2.pid));
          fs3.closeSync(fd);
          log2("\u6E05\u7406\u8FC7\u671F\u9501\u6587\u4EF6\u5E76\u91CD\u65B0\u83B7\u53D6\u9501");
          return true;
        } catch {
          logError2("\u65E0\u6CD5\u6E05\u7406\u8FC7\u671F\u9501\u6587\u4EF6");
          return false;
        }
      }
      logError2(`\u65E0\u6CD5\u521B\u5EFA\u9501\u6587\u4EF6: ${String(err)}`);
      return false;
    }
  } catch (err) {
    logError2(`\u65E0\u6CD5\u83B7\u53D6\u9501\u6587\u4EF6: ${String(err)}`);
    return false;
  }
}
function releaseLock() {
  try {
    const lockFile = getLockPidFile();
    if (fs3.existsSync(lockFile)) {
      const pid = fs3.readFileSync(lockFile, "utf-8").trim();
      if (pid === String(process2.pid)) {
        fs3.unlinkSync(lockFile);
      }
    }
  } catch {
  }
}
function truncateText(text, maxLen = MAX_REPLY_LENGTH) {
  if (text.length <= maxLen) return text;
  log2(`\u6D88\u606F\u8D85\u957F (${text.length} \u5B57\u7B26)\uFF0C\u622A\u65AD\u81F3 ${maxLen}`);
  return text.slice(0, maxLen);
}
async function extractContentFromMessage(msg) {
  if (!msg.item_list?.length) return "";
  for (const item of msg.item_list) {
    if (item.type === MSG_ITEM_TEXT && item.text_item?.text) {
      const text = item.text_item.text;
      const ref = item.ref_msg;
      if (!ref) return text;
      const parts = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refItem = ref.message_item;
        if (refItem.text_item?.text) {
          parts.push(refItem.text_item.text);
        } else if (refItem.voice_item?.text) {
          parts.push(refItem.voice_item.text);
        }
      }
      if (!parts.length) return text;
      return `[\u5F15\u7528: ${parts.join(" | ")}]
${text}`;
    }
    if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) {
      return `[\u8BED\u97F3] ${item.voice_item.text}`;
    }
    if (item.type === MSG_ITEM_IMAGE && item.image_item?.media) {
      const buf = await downloadAndDecryptBuffer(item.image_item.media);
      if (buf) {
        const MAX_IMAGE_SIZE = 512 * 1024;
        if (buf.length > MAX_IMAGE_SIZE) {
          return `[\u56FE\u7247] (\u56FE\u7247\u8FC7\u5927: ${(buf.length / 1024).toFixed(0)}KB\uFF0C\u5DF2\u8DF3\u8FC7)`;
        }
        const ext = detectImageExtension(buf);
        const b64 = buf.toString("base64");
        return `[\u56FE\u7247] data:image/${ext};base64,${b64}`;
      }
      return "[\u56FE\u7247] (\u65E0\u6CD5\u4E0B\u8F7D\u6216\u89E3\u5BC6)";
    }
    if (item.type === MSG_ITEM_FILE && item.file_item) {
      const fi = item.file_item;
      const parts = ["[\u6587\u4EF6]"];
      if (fi.file_name) parts.push(`\u540D\u79F0: ${fi.file_name}`);
      if (fi.len) parts.push(`\u5927\u5C0F: ${formatFileSize(fi.len)}`);
      return parts.join(" ");
    }
    if (item.type === MSG_ITEM_VIDEO && item.video_item) {
      const vi = item.video_item;
      const parts = ["[\u89C6\u9891]"];
      if (vi.video_size) parts.push(`\u5927\u5C0F: ${formatFileSize(String(vi.video_size))}`);
      if (vi.play_length) parts.push(`\u65F6\u957F: ${vi.play_length}\u79D2`);
      return parts.join(" ");
    }
  }
  return "";
}
function detectImageExtension(buf) {
  if (buf[0] === 137 && buf[1] === 80) return "png";
  if (buf[0] === 255 && buf[1] === 216) return "jpeg";
  if (buf[0] === 71 && buf[1] === 73) return "gif";
  if (buf[0] === 82 && buf[1] === 73) return "webp";
  return "png";
}
function formatFileSize(sizeStr) {
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return sizeStr;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
async function getUpdates(baseUrl, token, getUpdatesBuf, timeoutMs) {
  try {
    const raw = await apiFetch({
      baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: getUpdatesBuf,
        base_info: buildBaseInfo()
      }),
      token,
      timeoutMs
    });
    return JSON.parse(raw);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf };
    }
    throw err;
  }
}
function generateClientId() {
  return `claude-wechat:${Date.now()}-${crypto3.randomBytes(4).toString("hex")}`;
}
async function sendTextMessage(baseUrl, token, to, text, contextToken) {
  const truncatedText = truncateText(text);
  const clientId = generateClientId();
  await apiFetch({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: JSON.stringify({
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MSG_TYPE_BOT,
        message_state: MSG_STATE_FINISH,
        item_list: [{ type: MSG_ITEM_TEXT, text_item: { text: truncatedText } }],
        context_token: contextToken
      },
      base_info: buildBaseInfo()
    }),
    token,
    timeoutMs: 15e3
  });
  return clientId;
}
async function sendTextMessageWithRetry(baseUrl, token, to, text, contextToken) {
  let lastError = null;
  for (let attempt = 0; attempt <= SEND_RETRY_COUNT; attempt++) {
    try {
      return await sendTextMessage(baseUrl, token, to, text, contextToken);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < SEND_RETRY_COUNT) {
        log2(`\u53D1\u9001\u5931\u8D25 (\u7B2C ${attempt + 1} \u6B21)\uFF0C${SEND_RETRY_DELAY_MS / 1e3}s \u540E\u91CD\u8BD5...`);
        await new Promise((r) => setTimeout(r, SEND_RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}
async function claudeReplySpawn(senderId, content, sessions, account) {
  const sessionId = sessions[senderId];
  const senderName = senderId.split("@")[0] || senderId;
  const prompt = `[\u5FAE\u4FE1\u6D88\u606F] \u6765\u81EA: ${senderName}
${content}

\u8BF7\u7528\u4E2D\u6587\u56DE\u590D\uFF0C\u4E0D\u8981\u4F7F\u7528 Markdown \u683C\u5F0F\u3002`;
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--max-turns",
    "1"
  ];
  if (sessionId) {
    args.unshift("--resume", sessionId);
  }
  log2(`\u8C03\u7528 claude ${sessionId ? `--resume ${sessionId.slice(0, 8)}...` : "(\u65B0\u4F1A\u8BDD)"} \u2014 ${content.slice(0, 50)}...`);
  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process2.env,
        ANTHROPIC_API_KEY: process2.env.ANTHROPIC_API_KEY ?? ""
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      logError2(`claude -p \u8D85\u65F6 (${CLAUDE_TIMEOUT_MS / 1e3}s)`);
      resolve("\u62B1\u6B49\uFF0C\u56DE\u590D\u8D85\u65F6\u4E86\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
    }, CLAUDE_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || !stdout.trim()) {
        const errSnippet = stderr.slice(0, 200) || `exit code ${code}`;
        logError2(`claude -p \u5931\u8D25: ${errSnippet}`);
        resolve("\u62B1\u6B49\uFF0C\u5904\u7406\u6D88\u606F\u65F6\u51FA\u73B0\u4E86\u95EE\u9898\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        const reply = result.result ?? result.text ?? result.output ?? JSON.stringify(result);
        if (!sessionId && result.session_id) {
          sessions[senderId] = result.session_id;
          saveSessions(sessions);
          log2(`\u4FDD\u5B58\u65B0\u4F1A\u8BDD: ${senderId} \u2192 ${result.session_id.slice(0, 8)}...`);
        }
        log2(`claude \u56DE\u590D: ${reply.slice(0, 80)}...`);
        resolve(reply);
      } catch {
        const rawReply = stdout.trim().slice(0, MAX_REPLY_LENGTH);
        log2(`claude \u56DE\u590D (raw): ${rawReply.slice(0, 80)}...`);
        resolve(rawReply);
      }
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      logError2(`claude -p \u542F\u52A8\u5931\u8D25: ${err.message}`);
      resolve("\u62B1\u6B49\uFF0CClaude Code \u672A\u5B89\u88C5\u6216\u65E0\u6CD5\u542F\u52A8\u3002\u8BF7\u786E\u4FDD claude \u547D\u4EE4\u53EF\u7528\u3002");
    });
  });
}
var sessionManager = null;
async function claudeReply(senderId, content, sessions, account) {
  if (sessionManager?.isSdkMode) {
    return sessionManager.sendMessage(senderId, content);
  }
  return claudeReplySpawn(senderId, content, sessions, account);
}
var HELP_TEXT = [
  "\u53EF\u7528\u547D\u4EE4\uFF1A",
  "/help \u2014 \u663E\u793A\u6B64\u5E2E\u52A9",
  "/clear \u2014 \u6E05\u7A7A\u5BF9\u8BDD\u4E0A\u4E0B\u6587\uFF0C\u5F00\u59CB\u65B0\u4F1A\u8BDD",
  "",
  "\u5176\u4ED6\u6D88\u606F\u4F1A\u76F4\u63A5\u53D1\u9001\u7ED9 Claude Code \u5904\u7406\u3002"
].join("\n");
function computeBackoffMs(failures) {
  const base = Math.pow(2, failures) * 2e3;
  const jitter = Math.floor(Math.random() * 1e3);
  return Math.min(base + jitter, 6e4);
}
var typingManager = new TypingManager();
async function processMessages(msgs, account, sessions, manager) {
  for (const msg of msgs ?? []) {
    const senderId = msg.from_user_id ?? "unknown";
    const types = msg.item_list?.map((i) => i.type).join(",") ?? "none";
    log2(`\u5165\u7AD9\u6D88\u606F: from=${senderId} msg_type=${msg.message_type} items=[${types}]`);
    if (msg.message_type !== MSG_TYPE_USER) continue;
    if (msg.context_token) {
      cacheContextToken(senderId, msg.context_token);
    }
    const content = await extractContentFromMessage(msg);
    if (!content) {
      const itemTypes = msg.item_list?.map((i) => i.type).join(",") ?? "none";
      log2(`\u8FC7\u6EE4\u6D88\u606F: from=${senderId} item_types=[${itemTypes}] (\u65E0\u53EF\u7528\u5185\u5BB9)`);
      continue;
    }
    log2(`\u6536\u5230\u6D88\u606F: from=${senderId} content=${content.slice(0, 80)}...`);
    const trimmed = content.trim();
    if (trimmed === "/clear") {
      if (manager?.isSdkMode) {
        await manager.clearSession(senderId);
      } else {
        clearSession(sessions, senderId);
      }
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, "\u4E0A\u4E0B\u6587\u5DF2\u6E05\u7A7A\uFF0C\u4E0B\u6B21\u6D88\u606F\u5C06\u5F00\u59CB\u65B0\u4F1A\u8BDD\u3002", contextToken);
        } catch (err) {
          logError2(`\u53D1\u9001 /clear \u56DE\u590D\u5931\u8D25: ${String(err)}`);
        }
      }
      continue;
    }
    if (trimmed === "/help") {
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, HELP_TEXT, contextToken);
        } catch (err) {
          logError2(`\u53D1\u9001 /help \u56DE\u590D\u5931\u8D25: ${String(err)}`);
        }
      }
      continue;
    }
    await typingManager.sendTyping(senderId, 1);
    typingManager.startKeepalive(senderId);
    try {
      const reply = await claudeReply(senderId, content, sessions, account);
      await typingManager.sendTyping(senderId, 2);
      typingManager.stopKeepalive(senderId);
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, reply, contextToken);
      } else {
        logError2(`\u65E0\u6CD5\u56DE\u590D ${senderId}: \u7F3A\u5C11 context_token`);
      }
    } catch (err) {
      logError2(`\u5904\u7406\u6D88\u606F\u5931\u8D25: ${String(err)}`);
      await typingManager.sendTyping(senderId, 2);
      typingManager.stopKeepalive(senderId);
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, "\u62B1\u6B49\uFF0C\u5904\u7406\u6D88\u606F\u65F6\u51FA\u73B0\u4E86\u95EE\u9898\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002", contextToken);
        } catch {
        }
      }
    }
  }
}
async function handlePollError(err, consecutiveFailures) {
  consecutiveFailures++;
  logError2(`\u8F6E\u8BE2\u5F02\u5E38: ${String(err)}`);
  const delay = computeBackoffMs(consecutiveFailures);
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    logError2(`\u8FDE\u7EED\u5931\u8D25 ${MAX_CONSECUTIVE_FAILURES} \u6B21\uFF0C\u7B49\u5F85 ${delay / 1e3}s`);
  }
  await new Promise((r) => setTimeout(r, delay));
  return consecutiveFailures;
}
async function startPolling(account, sessions, manager) {
  const { baseUrl, token } = account;
  let getUpdatesBuf = "";
  let consecutiveFailures = 0;
  let longPollTimeout = LONG_POLL_TIMEOUT_MS;
  let emptyPollCount = 0;
  const syncBufFile = getSyncBufFile();
  try {
    if (fs3.existsSync(syncBufFile)) {
      getUpdatesBuf = fs3.readFileSync(syncBufFile, "utf-8");
      log2(`\u6062\u590D\u4E0A\u6B21\u540C\u6B65\u72B6\u6001 (${getUpdatesBuf.length} bytes)`);
    }
  } catch (err) {
    log2(`\u52A0\u8F7D\u540C\u6B65\u72B6\u6001\u5931\u8D25: ${String(err)}`);
  }
  loadContextTokens();
  if (account.savedAt) {
    try {
      const ageMs = Date.now() - new Date(account.savedAt).getTime();
      const ageHours = Math.round(ageMs / 36e5);
      log2(`\u51ED\u636E\u4FDD\u5B58\u4E8E ${account.savedAt}\uFF0C\u8DDD\u4ECA ${ageHours} \u5C0F\u65F6`);
    } catch {
    }
  }
  log2(`channel_version: ${CHANNEL_VERSION}`);
  log2("\u5F00\u59CB\u76D1\u542C\u5FAE\u4FE1\u6D88\u606F (\u72EC\u7ACB Bot \u6A21\u5F0F)...");
  while (true) {
    try {
      const resp = await getUpdates(baseUrl, token, getUpdatesBuf, longPollTimeout);
      const msgCount = resp.msgs?.length ?? 0;
      log2(`getUpdates: ret=${resp.ret ?? 0} errcode=${resp.errcode ?? 0} msgs=${msgCount} buf=${resp.get_updates_buf?.length ?? getUpdatesBuf.length}b timeout=${longPollTimeout}ms`);
      const isError = resp.ret !== void 0 && resp.ret !== 0 || resp.errcode !== void 0 && resp.errcode !== 0;
      if (isError) {
        if (resp.ret === -14 || resp.errcode === -14) {
          logError2("\u4F1A\u8BDD\u5DF2\u8FC7\u671F (errcode -14)\uFF0C\u8BF7\u91CD\u65B0\u8FD0\u884C setup \u767B\u5F55");
          logError2("1 \u5C0F\u65F6\u540E\u91CD\u8BD5...");
          await new Promise((r) => setTimeout(r, 36e5));
          continue;
        }
        consecutiveFailures++;
        logError2(`getUpdates \u5931\u8D25: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`);
        const delay = computeBackoffMs(consecutiveFailures);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logError2(`\u8FDE\u7EED\u5931\u8D25 ${MAX_CONSECUTIVE_FAILURES} \u6B21\uFF0C\u7B49\u5F85 ${delay / 1e3}s`);
          consecutiveFailures = 0;
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      consecutiveFailures = 0;
      if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms >= LONG_POLL_TIMEOUT_MIN_MS && resp.longpolling_timeout_ms <= LONG_POLL_TIMEOUT_MAX_MS) {
        longPollTimeout = resp.longpolling_timeout_ms;
      }
      await processMessages(resp.msgs, account, sessions, manager);
      if (msgCount === 0) {
        emptyPollCount++;
        if (emptyPollCount % 10 === 0) {
          log2(`\u5FC3\u8DF3: \u957F\u8F6E\u8BE2\u6B63\u5E38 (\u5DF2\u7A7A\u8F6E\u8BE2 ${emptyPollCount} \u6B21)`);
        }
      } else {
        emptyPollCount = 0;
      }
      if (resp.get_updates_buf) {
        const oldLen = getUpdatesBuf.length;
        getUpdatesBuf = resp.get_updates_buf;
        if (oldLen !== getUpdatesBuf.length) {
          log2(`sync_buf \u66F4\u65B0: ${oldLen}b \u2192 ${getUpdatesBuf.length}b`);
        }
        try {
          fs3.mkdirSync(getCredentialsDir(), { recursive: true });
          fs3.writeFileSync(syncBufFile, getUpdatesBuf, "utf-8");
        } catch (err) {
          log2(`\u4FDD\u5B58\u540C\u6B65\u72B6\u6001\u5931\u8D25: ${String(err)}`);
        }
      }
    } catch (err) {
      consecutiveFailures = await handlePollError(err, consecutiveFailures);
    }
  }
}
async function main() {
  if (!acquireLock()) {
    process2.exit(1);
  }
  let sessions = loadSessions();
  log2(`\u52A0\u8F7D\u4F1A\u8BDD: ${Object.keys(sessions).length} \u4E2A\u7528\u6237`);
  let account = null;
  const managerDeps = {
    sendMessage: async (to, text, contextToken) => {
      if (!account) return;
      await sendTextMessageWithRetry(
        account.baseUrl,
        account.token,
        to,
        text,
        contextToken
      );
    },
    getContextToken: getCachedContextToken
  };
  sessionManager = new SessionManager(managerDeps);
  const sdkMode = await sessionManager.probeSdk();
  if (sdkMode) {
    log2("\u4F7F\u7528 Claude Agent SDK V2 \u6A21\u5F0F");
  } else {
    log2("\u4F7F\u7528 spawn \u6A21\u5F0F (claude -p \u5B50\u8FDB\u7A0B)");
  }
  const cleanup = () => {
    typingManager.stopAll();
    sessionManager?.closeAll();
    releaseLock();
    saveContextTokens();
  };
  process2.on("exit", cleanup);
  process2.on("SIGINT", () => {
    cleanup();
    process2.exit(0);
  });
  process2.on("SIGTERM", () => {
    cleanup();
    process2.exit(0);
  });
  account = loadCredentials();
  if (!account) {
    log2("\u672A\u627E\u5230\u5DF2\u4FDD\u5B58\u7684\u51ED\u636E\uFF0C\u542F\u52A8\u5FAE\u4FE1\u626B\u7801\u767B\u5F55...");
    log2("\u6B63\u5728\u83B7\u53D6\u5FAE\u4FE1\u767B\u5F55\u4E8C\u7EF4\u7801...");
    const qrResp = await fetchQRCode(DEFAULT_BASE_URL);
    log2("\n\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u626B\u63CF\u4EE5\u4E0B\u4E8C\u7EF4\u7801\uFF1A\n");
    try {
      const qrterm = await Promise.resolve().then(() => __toESM(require_main(), 1));
      await new Promise((resolve) => {
        qrterm.default.generate(
          qrResp.qrcode_img_content,
          { small: true },
          (qr) => {
            process2.stderr.write(qr + "\n");
            resolve();
          }
        );
      });
    } catch {
      log2(`\u4E8C\u7EF4\u7801\u94FE\u63A5: ${qrResp.qrcode_img_content}`);
    }
    log2("\u7B49\u5F85\u626B\u7801...");
    const deadline = Date.now() + 48e4;
    let scannedPrinted = false;
    while (Date.now() < deadline) {
      const status = await pollQRStatus(DEFAULT_BASE_URL, qrResp.qrcode);
      switch (status.status) {
        case "wait":
          break;
        case "scaned":
          if (!scannedPrinted) {
            log2("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u5FAE\u4FE1\u4E2D\u786E\u8BA4...");
            scannedPrinted = true;
          }
          break;
        case "expired":
          log2("\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u542F\u52A8\u3002");
          process2.exit(1);
          break;
        case "confirmed": {
          if (!status.ilink_bot_id || !status.bot_token) {
            logError2("\u767B\u5F55\u786E\u8BA4\u4F46\u672A\u8FD4\u56DE bot \u4FE1\u606F");
            process2.exit(1);
          }
          const confirmedAccount = {
            token: status.bot_token,
            baseUrl: status.baseurl || DEFAULT_BASE_URL,
            accountId: status.ilink_bot_id,
            userId: status.ilink_user_id,
            savedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          saveCredentials(confirmedAccount);
          account = confirmedAccount;
          log2("\u5FAE\u4FE1\u8FDE\u63A5\u6210\u529F\uFF01");
          break;
        }
      }
      if (account) break;
      await new Promise((r) => setTimeout(r, 1e3));
    }
    if (!account) {
      logError2("\u767B\u5F55\u5931\u8D25\uFF0C\u9000\u51FA\u3002");
      process2.exit(1);
    }
  } else {
    log2(`\u4F7F\u7528\u5DF2\u4FDD\u5B58\u8D26\u53F7: ${account.accountId}`);
  }
  typingManager.configure(account.accountId, account.token, account.baseUrl);
  await startPolling(account, sessions, sessionManager);
}
main().catch((err) => {
  logError2(`Fatal: ${String(err)}`);
  process2.exit(1);
});
