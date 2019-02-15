

# default target: run tests

tests : libSync/ffprobe.run libSync/ltc.run libSync/sessions.run libSync/timing_metadata.run

%.run: %.js
	node $<

# ffmpeg binaries:

# os.platform()=="win32" && os.arch()=="x64"
# https://ffmpeg.zeranoe.com/builds/win64/static/ffmpeg-4.1-win64-static.zip

# os.platform()=="win32" && os.arch()=="ia32"
# https://ffmpeg.zeranoe.com/builds/win32/static/ffmpeg-4.1-win32-static.zip

# os.platform()=="darwin"
# https://ffmpeg.zeranoe.com/builds/macos64/static/ffmpeg-4.1-macos64-static.zip

# os.platform()=="linux" && os.arch()=="x64"
# https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz

# os.platform()=="linux" && os.arch()=="ia32"
# https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-i686-static.tar.xz
