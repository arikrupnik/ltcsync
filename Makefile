

# default target: run tests

tests : libSync/ffprobe.run libSync/ltc.run libSync/sessions.run libSync/timing_metadata.run

%.run: %.js
	node $<
