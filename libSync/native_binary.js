/* native_binary.js: find platform-specific binary dependencies */

const os = require("os");
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const assert = require("assert");

function bin_dir() {
  return path.join(__dirname, `${os.platform()}-${os.arch()}-bin`);
}

function platform_support() {
  try {
    return fs.statSync(bin_dir()).isDirectory();
  } catch (e) {
    return false;
  }
}
function $platform_support() {
  assert(platform_support());
}

function binary_path(name) {
  return path.join(bin_dir(), name) + (os.platform()=="win32" ? ".exe" : "");
}

/* This function makes it unnecessary for other modules to
 * require("child_process"). If other functions from child_process
 * become necessary (e.g., spawnSync), this module can easily add
 * them. */
function spawn(command, args, options) {
  return cp.spawn(binary_path(command), args, options);
}
function $spawn() {
  let l_output="";
  const l_proc=spawn("ltcdump", ["--version"]);
  l_proc.stdout.on("data", chunck => l_output+=chunck);
  l_proc.on("close", code => {
    assert.equal(code, 0);
    assert.equal(l_output.split("\n")[0].trim(), "ltcdump version 0.7.0");
  });

  let fm_output="";
  const fm_proc=spawn("ffmpeg", ["-version"]);
  fm_proc.stdout.on("data", chunck => fm_output+=chunck);
  fm_proc.on("close", code => {
    assert.equal(code, 0);
    assert(fm_output.split("\n")[0].startsWith("ffmpeg version 4.1"));
  });

  let fp_output="";
  const fp_proc=spawn("ffprobe", ["-version"]);
  fp_proc.stdout.on("data", chunck => fp_output+=chunck);
  fp_proc.on("close", code => {
    assert.equal(code, 0);
    assert(fp_output.split("\n")[0].startsWith("ffprobe version 4.1"));
  });
}

if (require.main === module) {
  $platform_support();
  $spawn();
  // other functions in this module are hard to test without tautologies
} else {
  module.exports.platform_support = platform_support;
  module.exports.binary_path = binary_path;
  module.exports.spawn = spawn;
}
