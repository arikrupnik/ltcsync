/* ltc.js: functions for parsing timestamp data out of audio
 * streams. This implementation uses ltcdump(1) as the backend. */

const path = require("path");
const nb = require("./native_binary");

const assert = require('assert');

/* parse a single line of `ltcdump' output, correspnding to a single
 * LTC frame */
function parse_ltcdump_frame(line) {
  const fields=line.split(/[ \t|]+/);
  /* [user_bits, timecode, samples_start, samples_end, fw/rv] */
  const tc=fields[1].split(/[:;\.]/).map(Number);
  if (fields.length != 5) {
    throw new TypeError(`expecting 5 fields in an ltcdump frame, found ${fields.length}: ${fields}`);
  }

  return {
    seconds: ((tc[0]*60 + tc[1])*60)+tc[2],
    frames: tc[3],
    dropframe: fields[1].charAt(8)!=":",
    samples: fields.slice(2,4).map(Number),
  };
}

function $parse_ltcdump_frame() {
  // typical frame
  assert.deepEqual(
    parse_ltcdump_frame("00000000   04:49:39:10 |   284200   286199  "),
    {seconds: 17379,
     frames: 10,
     dropframe: false,
     samples: [ 284200, 286199 ]});
  // semicolon indicates drop-frame format
  assert.deepEqual(
    parse_ltcdump_frame("00000000   04:49:39;10 |   284200   286199  "),
    {seconds: 17379,
     frames: 10,
     dropframe: true,
     samples: [ 284200, 286199 ]});
  // spaces at the end of the line are significant...
  assert.throws(() => {
    parse_ltcdump_frame("00000000   04:49:33:12 |      193     2201")});
  // ...since ltcdump(1) can parse frames out of reverse-playing audio
  assert.deepEqual(
    parse_ltcdump_frame("00000000   04:49:39:10 |   284200   286199 R"),
    {seconds: 17379,
     frames: 10,
     dropframe: false,
     samples: [ 284200, 286199 ]});
}


/* parse the entire output of running `ltcdump` on a wav file, and
 * return an array of decoded ltc frames */
function parse_ltcdump(text) {
  let frames=[];
  for (let line of text.split("\n")) {
    if (line && line.charAt(0) != "#") {
      frames.push(parse_ltcdump_frame(line));
    }
  }
  return frames;
}

function $parse_ltcdump() {
  assert.equal(parse_ltcdump("#User bits  Timecode   |    Pos. (samples)\n" +
                             "#DISCONTINUITY\n" +
                             "00000000   04:49:33:12 |      193     2201  \n" +
                             "00000000   04:49:33:13 |     2202     4201  \n" +
                             "00000000   04:49:33:14 |     4202     6201  \n" +
                             "00000000   04:49:33:15 |     6202     8201  \n" +
                             "00000000   04:49:33:16 |     8202    10204  \n" +
                             "00000000   04:49:33:17 |    10205    12204  \n" +
                             "00000000   04:49:33:18 |    12205    14204  \n" +
                             "00000000   04:49:33:19 |    14205    16204  \n").length,
               8);
}

/* run ltcdump(1) on a wav file and parse out LTC frame information */
function ltcdump(filepath, callback) {
  let output="";
  let error="";
  const ltcdump=nb.spawn("ltcdump", [filepath]);
  ltcdump.stdout.on("data", function(chunk) {
    output+=chunk.toString("ascii");
  });
  ltcdump.stderr.on("data", function(chunk) {
    error+=chunk.toString("ascii");
  });
  ltcdump.on("close", function(code, signal) {
    if (code!=0) {
      callback(new Error(error), null);
    } else {
      let frames=parse_ltcdump(output);
      callback(null, frames);
    }
  });
}

function $ltcdump() {
  ltcdump(path.join(__dirname, "../build/samples/ltc.wav"),
          function(err, frames) {
            assert(!err);
            assert.equal(frames.length, 143);
            assert.deepEqual(frames[0],
                             {seconds: 17373,
                              frames: 12,
                              dropframe: false,
                              samples: [ 193, 2201 ]});
            assert.deepEqual(frames[frames.length-1],
                             {seconds: 17379,
                              frames: 10,
                              dropframe: false,
                              samples: [ 284200, 286199 ]});
          });
  ltcdump("/non-file/",
          function(err, frames) {
            assert(!frames);
            assert.equal(
              err.message.trim(),
              "Error: This is not a sndfile supported audio file format");
          });
}


/* Compares the quality of two sets of LTC frames. Sometimes, ltcdump
 * finds frames in multiple audio streams. This function can help
 * choose one of the streams. Returns a negative number if frames1 is
 * preferable, zero if they are equivalent or positive if frames0 is
 * preferable. Current implementation is a placeholder. */
function compare_ltc_quality(frames0, frames1) {
  return frames0.length - frames1.length;
}

function $compare_ltc_quality() {
  assert(compare_ltc_quality([ ], [1]) < 0);
  assert(compare_ltc_quality([1], [ ]) > 0);
  assert(compare_ltc_quality([1], [1]) == 0);
}


function closest_standard_framerate(rate) {
  const d=r => Math.abs(1-r/rate);
  return [24/1.001, 24, 25, 30/1.001, 30].sort((r0, r1) => d(r0) - d(r1))[0];
}

function $closest_standard_framerate() {
  assert.equal(closest_standard_framerate(23.5 ), 24/1.001);
  assert.equal(closest_standard_framerate(23.9 ), 24/1.001);
  assert.equal(closest_standard_framerate(23.98), 24/1.001);
  assert.equal(closest_standard_framerate(23.99), 24);
  assert.equal(closest_standard_framerate(24.45), 24);
  assert.equal(closest_standard_framerate(24.55), 25);
  assert.equal(closest_standard_framerate(29.97), 30/1.001);
  assert.equal(closest_standard_framerate(29.99), 30);
  assert.equal(closest_standard_framerate(30   ), 30);
  assert.equal(closest_standard_framerate(31   ), 30);
}

/* deduce LTC frame rate from LTC frames and audio sample rate */
function framerate(frames, sample_rate) {
  const frame_duration = frame => frame.samples[1]-frame.samples[0]+1;
  frames = frames.slice(1, -1); // first and last frames are often inaccurate
  const avg_duration = frames.map(frame_duration).reduce((e0,e1) => e0+e1)/frames.length;
  return closest_standard_framerate(sample_rate / avg_duration);
}

function $framerate() {
  ltcdump(path.join(__dirname,
                    "../build/samples/ZOOM0004_Tr1.WAV"),
          (err, frames) => assert.equal(framerate(frames, 48000), 24));
  ltcdump(path.join(__dirname,
                    "../build/samples/LTC_00_58_00_00__1mins_23976.wav"),
          (err, frames) => assert.equal(framerate(frames, 48000), 24/1.001));
  ltcdump(path.join(__dirname,
                    "../build/samples/LTC_00_58_00_00__1mins_24.wav"),
          (err, frames) => assert.equal(framerate(frames, 48000), 24));
  ltcdump(path.join(__dirname,
                    "../build/samples/LTC_00_58_00_00__1mins_25.wav"),
          (err, frames) => assert.equal(framerate(frames, 48000), 25));
  // this file appears to have 30fps frames, although with DF flags
  // set and correctly omitting initial frames in a minute
  //ltcdump(path.join(__dirname,
  //                  "../build/samples/LTC_00_58_00_00__1mins_2997_df.wav"),
  //        (err, frames) => assert.equal(framerate(frames, 48000), 30/1.001));
  ltcdump(path.join(__dirname,
                    "../build/samples/LTC_00_58_00_00__1mins_2997_ndf.wav"),
          (err, frames) => assert.equal(framerate(frames, 48000), 30/1.001));
  ltcdump(path.join(__dirname,
                    "../build/samples/LTC_00_58_00_00__1mins_30.wav"),
          (err, frames) => assert.equal(framerate(frames, 48000), 30));
}

/* translate TC into wall clock seconds since midnight */
function seconds(ltc_frame, frame_rate) {
  const frames=ltc_frame.seconds*Math.round(frame_rate) + ltc_frame.frames;
  if (ltc_frame.dropframe) {
    const whole_minutes=Math.floor(ltc_frame.seconds/60);
    const whole_10minutes=Math.floor(ltc_frame.seconds/600);
    return (frames-(whole_minutes-whole_10minutes)*2) / frame_rate;
  } else {
    return frames/frame_rate;
  }
}

function $seconds() {
  // any integer frame rate results in a straightforward number of seconds
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:00 |      193     2201  "),
    24), 3600);
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:00 |      193     2201  "),
    25), 3600);
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:00 |      193     2201  "),
    30), 3600);
  // non-drop-frame 29.97fps hour is about 3.6 seconds longer than a real hour
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:00 |      193     2201  "),
    30/1.001), 3603.5999999999995);
  // drop-frame fixes that, almost
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00;00 |      193     2201  "),
    30/1.001), 3599.9963999999995);
  
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:01 |      193     2201  "),
    24/1.001), 3603.641708333333);
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:01 |      193     2201  "),
    24), 3600+1/24);            // 3600.0416666666665
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:01 |      193     2201  "),
    25), 3600+1/25);            // 3600.04
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:01 |      193     2201  "),
    30/1.001), 3603.6333666666665);
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00;01 |      193     2201  "),
    30/1.001), 3600.029766666666);
  assert.equal(seconds(
    parse_ltcdump_frame("00000000   01:00:00:01 |      193     2201  "),
    30), 3600+1/30);            // 3600.0333333333333
}


if (require.main === module) {
  $parse_ltcdump_frame();
  $parse_ltcdump();
  $ltcdump();
  $compare_ltc_quality();
  $closest_standard_framerate();
  $framerate();
  $seconds();
} else {
  module.exports.ltcdump = ltcdump;
  module.exports.framerate = framerate;
  module.exports.seconds = seconds;
}
