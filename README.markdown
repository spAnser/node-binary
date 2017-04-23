binary
======

Unpack multibyte binary values from buffers and streams.
You can specify the endianness and signedness of the fields to be unpacked too.

This module is a cleaner and more complete version of
[bufferlist](https://github.com/substack/node-bufferlist)'s binary module that
runs on pre-allocated buffers instead of a linked list.

[![build status](https://secure.travis-ci.org/substack/node-binary.png)](http://travis-ci.org/substack/node-binary)

examples
========

stream.js
---------

``` js
var binary = require('binary');

var ws = binary()
    .word32lu('x')
    .word16bs('y')
    .word16bu('z')
    .tap(function (vars) {
        console.dir(vars);
    })
;
process.stdin.pipe(ws);
process.stdin.resume();
```

output:

```
$ node examples/stream.js
abcdefgh
{ x: 1684234849, y: 25958, z: 26472 }
^D
```

parse.js
--------

``` js
var buf = new Buffer([ 97, 98, 99, 100, 101, 102, 0 ]);

var binary = require('binary');
var vars = binary.parse(buf)
    .word16ls('ab')
    .word32bu('cf')
    .word8('x')
    .vars
;
console.dir(vars);
```

output:

```
{ ab: 25185, cf: 1667523942, x: 0 }
```

methods
=======

`var binary = require('binary')`

var b = binary()
----------------

Return a new writable stream `b` that has the chainable methods documented below
for buffering binary input.

binary.parse(buf)
-----------------

Parse a static buffer in one pass. Returns a chainable interface with the
methods below plus a `vars` field to get at the variable stash as the last item
in a chain.

In parse mode, methods will set their keys to `null` if the buffer isn't big
enough except `buffer()` and `scan()` which read up up to the end of the buffer
and stop.

b.word{8,16,24,32,64}{l,b}{e,u,s}(key)
-----------------------------------

Parse bytes in the buffer or stream given:

* number of bits
* endianness ( l : little, b : big ),
* signedness ( u and e : unsigned, s : signed )

These functions won't start parsing until all previous parser functions have run
and the data is available.

The result of the parse goes into the variable stash at `key`.
If `key` has dots (`.`s), it refers to a nested address. If parent container
values don't exist they will be created automatically, so for instance you can
assign into `dst.addr` and `dst.port` and the `dst` key in the variable stash
will be `{ addr : x, port : y }` afterwards.

``` js
var vars = binary.parse(new Buffer([5, 0, 80, 11, 184]))
    .word8lu('count')
    .word16lu('ports.src')
    .word16bu('ports.dst')
    .vars;
console.log(vars)

//{ count: 5, ports: { src: 80, dst: 3000 } }
```


b.buffer(key, size)
-------------------

Take `size` bytes directly off the buffer stream, putting the resulting buffer
slice in the variable stash at `key`. If `size` is a string, use the value at
`vars[size]`. The key follows the same dotted address rules as the word
functions.

``` js
var vars = binary.parse(new Buffer([4, 1, 0, 1, 0]))
    .word8lu('dataLength')
    .buffer('data', 'dataLength')
    .vars;
console.log(vars.data)

//<Buffer 01 00 01 00>
```

b.scan(key, buffer)
-------------------

Search for `buffer` in the stream and store all the intervening data in the
stash at at `key`, excluding the search buffer. If `buffer` passed as a string,
it will be converted into a Buffer internally.

For example, to read in a line you can just do:

``` js
var b = binary()
    .scan('line', new Buffer('\r\n'))
    .tap(function (vars) {
        console.log(vars.line)
    })
;
stream.pipe(b);
```

b.tap(cb)
---------

The callback `cb` is provided with the variable stash from all the previous
actions once they've all finished.

You can nest additional actions onto `this` inside the callback.
``` js
binary.parse(new Buffer([4, 1, 0, 1, 0]))
    .word8lu('dataLength')
    .tap(function (vars) {
        var getInt;
        if (vars.dataLength <= 4 && vars.dataLength !== 3) {
            getInt = "word" + (8 * vars.dataLength) + "lu";
            this[getInt]('data');
        } else {
            this.skip(vars.dataLength);
        }
    })
    .vars;
console.log(vars);

//{ dataLength: 4, data: 65537 }
```

b.into(key, cb)
---------------

Like `.tap()`, except all nested actions will assign into a `key` in the `vars`
stash.

``` js
var vars = binary.parse(new Buffer([45, 13, 8]))
    .word8lu('avg')
    .into('stdDev', function (inner) {
        // e.g. q8.8 formatted std dev
        this.word8lu('integer')
        .word8lu('decimal');
        console.log("inner", inner)
    })
    .vars;
console.log("outer", vars);

//inner { integer: 13, decimal: 8 }
//outer { avg: 45, stdDev: { integer: 13, decimal: 8 } }
```


b.loop(cb)
----------

Loop, each time calling `cb(end, vars)` for function `end` and the variable
stash with `this` set to a new chain for nested parsing. The loop terminates
once `end` is called.

``` js
var entries = [];
var vars = binary.parse(new Buffer([3, 1, 97, 3, 99, 97, 116, 4, 119, 105, 110, 115]))
    .word8lu('wordCount')
    .loop(function (end, inner) {
        this.word8lu('length')
          .string('word', inner.length)
          .vars;
        entries.push(this.vars.word.toString('ascii'));
        if (entries.length >= inner.wordCount) {
          end();
        }
        console.log("inner", inner);
    })
    .vars;
console.log("outer", vars);
console.log("entries", entries);

//inner { wordCount: 3, length: 1, word: 'a' }
//inner { wordCount: 3, length: 3, word: 'cat' }
//inner { wordCount: 3, length: 4, word: 'wins' }
//outer { wordCount: 3, length: 4, word: 'wins' }
//entries [ 'a', 'cat', 'wins' ]
```

b.string(key, size)
---------

Read `size` bytes as a utf8 string, or read until end of buffer if size not
specified. Puts the resulting string in the variable stash at `key`.
If `size` is a string, use the value at `vars[size]`. The key follows the same
dotted address rules as the word functions.

``` js
var vars = binary.parse(new Buffer([97, 32, 99, 97, 116, 32, 119, 105, 110, 115]))
    .string('res')
    .vars;
console.log(vars);

// { res: 'a cat wins' }
```

b.cstring(key, size)
---------

Same as `string()`, but read as a null-terminated utf8 string (slices off the
null character and anything after it, or last character if no null found)

``` js
var vars = binary.parse(new Buffer([97, 32, 99, 97, 116, 32, 119, 105, 110, 115, 0]))
    .cstring('res')
    .vars;
console.log(vars);

// { res: 'a cat wins' }
```

b.skip(size)
---------

Skip <size> bytes. If `size` is a string, use the value at `vars[size]`. The
key follows the same dotted address rules as the word functions.

``` js
var vars = binary.parse(new Buffer([5, 13, 80]))
    .word8lu('count')
    .skip(1)
    .word8lu('port')
    .vars;
console.log(vars);

//{ count: 5, port: 80 }
```

b.tell()
---------

Return the current offset in the buffer

``` js
var pos = binary.parse(new Buffer([5, 0, 80, 11, 184]))
    .word8lu('count')
    .tell();
console.log(pos);

// 1
```

b.flush()
---------

Clear the variable stash entirely.
``` js
var pos = binary.parse(new Buffer([5, 0, 80, 11, 184]))
    .word8lu('preFlush')
    .word8lu('preFlush2')
    .flush()
    .word8lu('postFlush')
    .word8lu('postFlush2')
    .tap(function (inner) {
      console.log("inner", inner);
    })
    .vars;

console.log("outer:", vars);

//inner { postFlush: 80, postFlush2: 11 }
//outer: { preFlush: 5 } //not sure why
```

installation
============

To install with [npm](http://github.com/npm/npm):

```
npm install binary@Casear/node-binary
```

notes
=====

The word64 functions will only return approximations since javascript uses ieee
floating point for all number types. Mind the loss of precision.

license
=======

MIT

