var buf = new Buffer([ 0x30, 00, 65, 66, 67, 68, 0, 0, 69, 70 ]);

var binary = require('..');
var vars = binary.parse(buf)
    .word16ls('num')
    .cstring('s')
    .vars
console.log('vars=',vars)

vars = binary.parse(buf)
    .word16ls('num')
    .string('s')
    .vars
console.log('vars=',vars)


